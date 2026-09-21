"""Background wakeups for AI Quiz Battle timers.

These tasks are a delivery optimization, not the source of truth. Every stateful
request rechecks persisted server timestamps under a DB row lock, so a process
restart does not corrupt or restart a battle.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.services import challenge_service
from app.services.challenge_ws_manager import manager

logger = logging.getLogger(__name__)

_tasks: dict[tuple[int, str], asyncio.Task] = {}
_tasks_lock = asyncio.Lock()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _next_wake_from_state(state: dict) -> tuple[str, datetime] | None:
    status = state.get("status")
    if status == "countdown":
        started = _parse_iso(state.get("countdownStartedAt"))
        if started:
            return "countdown", started + timedelta(seconds=challenge_service.COUNTDOWN_SECONDS)
    if status in {"question_active", "waiting_for_opponent"}:
        deadline = _parse_iso(state.get("questionDeadlineAt"))
        if deadline:
            return "question_deadline", deadline
    if status == "question_reveal":
        started = _parse_iso(state.get("revealStartedAt")) or _parse_iso(state.get("questionDeadlineAt"))
        if started:
            return "reveal", started + timedelta(seconds=challenge_service.REVEAL_SECONDS)
    return None


def _schedule_key(challenge_id: int, phase: str) -> tuple[int, str]:
    return challenge_id, phase


async def _wake_task(challenge_id: int, phase: str, wake_at: datetime) -> None:
    try:
        delay = max(0.0, (wake_at - datetime.now(timezone.utc)).total_seconds())
        await asyncio.sleep(delay)
        if SessionLocal is None:
            return
        async with SessionLocal() as db:
            events, _ = await challenge_service.advance_challenge_timers(challenge_id, db)
        for event in events:
            await manager.broadcast(challenge_id, event)

        # Re-read state only when a challenge is still alive. This also makes
        # long-running countdown/reveal sequences self-healing after a slow wakeup.
        if SessionLocal is None:
            return
        async with SessionLocal() as db:
            state = None
            try:
                state = await challenge_service.get_challenge_state_for_runtime(challenge_id, db)
            except Exception:
                logger.exception("challenge_runtime_state_read_failed challenge_id=%s", challenge_id)
        if state:
            await schedule_from_state(challenge_id, state)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("challenge_runtime_wakeup_failed challenge_id=%s phase=%s", challenge_id, phase)
    finally:
        async with _tasks_lock:
            current = _tasks.get((challenge_id, phase))
            if current is asyncio.current_task():
                _tasks.pop((challenge_id, phase), None)


async def _schedule(challenge_id: int, phase: str, wake_at: datetime) -> None:
    async with _tasks_lock:
        key = _schedule_key(challenge_id, phase)
        old = _tasks.get(key)
        if old and not old.done():
            old.cancel()
        _tasks[key] = asyncio.create_task(_wake_task(challenge_id, phase, wake_at))


async def schedule_from_state(challenge_id: int, state: dict) -> None:
    target = _next_wake_from_state(state)
    if not target:
        return
    phase, wake_at = target
    await _schedule(challenge_id, phase, wake_at)


async def schedule_disconnect_expiry(challenge_id: int, disconnect_at: datetime | None = None) -> None:
    when = disconnect_at or datetime.now(timezone.utc)
    await _schedule(
        challenge_id,
        "disconnect",
        when + challenge_service.DISCONNECT_GRACE,
    )


async def cancel_challenge_tasks(challenge_id: int) -> None:
    async with _tasks_lock:
        keys = [key for key in _tasks if key[0] == challenge_id]
        for key in keys:
            task = _tasks.pop(key, None)
            if task and not task.done():
                task.cancel()


async def shutdown() -> None:
    async with _tasks_lock:
        tasks = list(_tasks.values())
        _tasks.clear()
    for task in tasks:
        if not task.done():
            task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
