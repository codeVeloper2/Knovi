"""AI Quiz Battle HTTP + WebSocket API."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal, get_session
from app.core.security import current_user, decode_token
from app.models.user import User
from app.schemas.challenge import (
    ChallengeActionOut,
    ChallengeAnswerAck,
    ChallengeAnswerRequest,
    ChallengeCreateRequest,
    ChallengeListOut,
    ChallengeOut,
    ChallengeResultOut,
    ChallengeReviewOut,
    ChallengeWSAnswerEvent,
    ChallengeWSHeartbeatEvent,
    ChallengeWSReadyEvent,
    ChallengeWSReconnectEvent,
    ChallengeMatchJoinRequest, ChallengeMatchStatusOut, AIChallengeCreateRequest,
)
from app.services import challenge_service, challenge_runtime
from app.services.challenge_ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


def _ws_error(detail: str, challenge_id: int | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {"message": detail}
    if challenge_id is not None:
        data["challengeId"] = challenge_id
    return {"type": "error", "data": data}


async def _load_ws_user(token: str) -> User:
    if not token:
        raise HTTPException(401, "WebSocket authentication is required.")
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(401, "WebSocket authentication is required.")
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(401, "Invalid WebSocket token.") from exc
    if SessionLocal is None:
        raise HTTPException(503, "Database is not configured.")
    async with SessionLocal() as db:
        from sqlalchemy import select
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user is None:
            raise HTTPException(401, "Account not found.")
        if not user.email_verified:
            raise HTTPException(403, "Please verify your email before using PeerUP.")
        return user


async def _broadcast_update(challenge_id: int, event_type: str = "challenge_updated") -> None:
    try:
        await manager.broadcast(challenge_id, {"type": event_type, "data": {"challengeId": challenge_id}})
    except Exception:
        logger.exception("challenge_ws_broadcast_failed challenge_id=%s event=%s", challenge_id, event_type)


@router.post("/challenges", response_model=ChallengeActionOut, status_code=status.HTTP_201_CREATED)
async def create_challenge(
    body: ChallengeCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    challenge = await challenge_service.create_challenge(
        challenger_id=user.id,
        opponent_id=body.opponent_id,
        subject_id=body.subject_id,
        topic_id=body.topic_id,
        concept_id=body.concept_id,
        question_count=body.question_count,
        db=session,
    )
    state = await challenge_service.get_challenge_state(challenge.id, user.id, session)
    return {"challenge": state, "message": "Challenge sent. Waiting for the opponent to accept."}


@router.post("/challenges/matchmaking/join", response_model=ChallengeMatchStatusOut)
async def join_challenge_matchmaking(
    body: ChallengeMatchJoinRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    queue, challenge = await challenge_service.join_matchmaking(
        user_id=user.id,
        subject_id=body.subject_id,
        topic_id=body.topic_id,
        concept_id=body.concept_id,
        source_session_id=body.source_session_id,
        class_level=user.grade or "",
        question_count=body.question_count,
        db=session,
    )
    if challenge is not None:
        await _broadcast_update(challenge.id, "challenge_match_found")
    return await challenge_service.matchmaking_status(user.id, session)


@router.get("/challenges/matchmaking/status", response_model=ChallengeMatchStatusOut)
async def challenge_matchmaking_status(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return await challenge_service.matchmaking_status(user.id, session)


@router.delete("/challenges/matchmaking", response_model=ChallengeMatchStatusOut)
async def leave_challenge_matchmaking(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return {**await challenge_service.leave_matchmaking(user.id, session), "queueId": None, "challengeId": None}


@router.post("/challenges/ai", response_model=ChallengeActionOut, status_code=status.HTTP_201_CREATED)
async def create_ai_challenge(
    body: AIChallengeCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    challenge = await challenge_service.create_ai_challenge(
        user_id=user.id, subject_id=body.subject_id, topic_id=body.topic_id,
        concept_id=body.concept_id, source_session_id=body.source_session_id,
        question_count=body.question_count, db=session,
    )
    await challenge_service.prepare_challenge(challenge.id, user.id, session)
    challenge, _ = await challenge_service.mark_ready(challenge.id, user.id, session)
    state = await challenge_service.get_challenge_state(challenge.id, user.id, session)
    if state.get("status") == "countdown":
        await challenge_runtime.schedule_from_state(challenge.id, state)
    return {"challenge": state, "message": "AI Challenge is ready. Your challenge countdown will begin now."}


@router.get("/challenges", response_model=ChallengeListOut)
async def list_challenges(
    limit: int = Query(default=30, ge=1, le=50),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return await challenge_service.list_challenges(user.id, session, limit=limit)


@router.get("/challenges/{challenge_id}", response_model=ChallengeOut)
async def get_challenge(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    state = await challenge_service.get_challenge_state(challenge_id, user.id, session)
    await challenge_runtime.schedule_from_state(challenge_id, state)
    return state


@router.post("/challenges/{challenge_id}/accept", response_model=ChallengeActionOut)
async def accept_challenge(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await challenge_service.accept_challenge(challenge_id, user.id, session)
    state = await challenge_service.get_challenge_state(challenge_id, user.id, session)
    await _broadcast_update(challenge_id)
    return {"challenge": state, "message": "Challenge accepted. Prepare the battle from both students' learned content."}


@router.post("/challenges/{challenge_id}/decline", response_model=ChallengeActionOut)
async def decline_challenge(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await challenge_service.decline_challenge(challenge_id, user.id, session)
    state = await challenge_service.get_challenge_state(challenge_id, user.id, session)
    await _broadcast_update(challenge_id, "challenge_declined")
    return {"challenge": state, "message": "Challenge declined."}


@router.post("/challenges/{challenge_id}/prepare", response_model=ChallengeActionOut)
async def prepare_challenge(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await challenge_service.prepare_challenge(challenge_id, user.id, session)
    state = await challenge_service.get_challenge_state(challenge_id, user.id, session)
    await _broadcast_update(challenge_id, "challenge_prepared")
    return {"challenge": state, "message": "Battle prepared from both students' shared learning context."}


@router.post("/challenges/{challenge_id}/start", response_model=ChallengeActionOut)
async def start_challenge(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    challenge, countdown_started = await challenge_service.mark_ready(challenge_id, user.id, session)
    await manager.broadcast(
        challenge_id,
        {"type": "player_ready", "data": {"challengeId": challenge_id, "userId": user.id}},
    )
    state = await challenge_service.get_challenge_state(challenge_id, user.id, session)
    if countdown_started:
        await manager.broadcast(
            challenge_id,
            {
                "type": "countdown",
                "data": {
                    "challengeId": challenge_id,
                    "startedAt": state.get("countdownStartedAt"),
                    "seconds": challenge_service.COUNTDOWN_SECONDS,
                },
            },
        )
    await challenge_runtime.schedule_from_state(challenge_id, state)
    return {
        "challenge": state,
        "message": "You are ready. Waiting for the other student." if not countdown_started else "Both students are ready. Battle countdown started.",
    }


@router.post("/challenges/{challenge_id}/questions/{question_id}/answer", response_model=ChallengeAnswerAck)
async def answer_challenge_question(
    challenge_id: int,
    question_id: int,
    body: ChallengeAnswerRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    ack, event = await challenge_service.submit_answer(
        challenge_id=challenge_id,
        user_id=user.id,
        question_id=question_id,
        answer=body.answer,
        db=session,
    )
    # Never leak correctness in the immediate acknowledgement or waiting event.
    await manager.send_user(challenge_id, user.id, {"type": "answer_ack", "data": ack})
    if event:
        await manager.broadcast(challenge_id, event)
        if event["type"] == "question_reveal":
            await challenge_runtime.schedule_from_state(
                challenge_id,
                await challenge_service.get_challenge_state_for_runtime(challenge_id, session) or {},
            )
    return ack


@router.get("/challenges/{challenge_id}/results", response_model=ChallengeResultOut)
async def get_challenge_results(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return await challenge_service.get_results(challenge_id, user.id, session)


@router.get("/challenges/{challenge_id}/review", response_model=ChallengeReviewOut)
async def get_challenge_review(
    challenge_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return await challenge_service.get_review(challenge_id, user.id, session)


@router.websocket("/challenges/ws/{challenge_id}")
async def challenge_websocket(
    websocket: WebSocket,
    challenge_id: int,
    token: str = Query(default=""),
) -> None:
    user: User | None = None
    socket_registered = False
    try:
        user = await _load_ws_user(token)
        if SessionLocal is None:
            await websocket.close(code=1011)
            return

        async with SessionLocal() as db:
            # Participant authorization is performed before accepting the socket.
            state = await challenge_service.get_challenge_state(challenge_id, user.id, db)
            await challenge_runtime.schedule_from_state(challenge_id, state)
            challenge, reconnected = await challenge_service.mark_connected(challenge_id, user.id, db)

        await manager.connect(challenge_id, user.id, websocket)
        socket_registered = True
        await manager.send_user(challenge_id, user.id, {"type": "challenge_state", "data": state})
        if reconnected:
            await manager.broadcast(
                challenge_id,
                {"type": "opponent_reconnected", "data": {"challengeId": challenge_id, "userId": user.id}},
            )

        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type") if isinstance(payload, dict) else None

            try:
                if event_type == "heartbeat":
                    ChallengeWSHeartbeatEvent.model_validate(payload)
                    await websocket.send_json({"type": "heartbeat_ack", "data": {"challengeId": challenge_id}})
                    continue

                if event_type == "reconnect":
                    ChallengeWSReconnectEvent.model_validate(payload)
                    async with SessionLocal() as db:
                        state = await challenge_service.get_challenge_state(challenge_id, user.id, db)
                    await websocket.send_json({"type": "challenge_state", "data": state})
                    await challenge_runtime.schedule_from_state(challenge_id, state)
                    continue

                if event_type == "ready":
                    ChallengeWSReadyEvent.model_validate(payload)
                    async with SessionLocal() as db:
                        _, countdown_started = await challenge_service.mark_ready(challenge_id, user.id, db)
                        state = await challenge_service.get_challenge_state(challenge_id, user.id, db)
                    await manager.broadcast(
                        challenge_id,
                        {"type": "player_ready", "data": {"challengeId": challenge_id, "userId": user.id}},
                    )
                    if countdown_started:
                        await manager.broadcast(
                            challenge_id,
                            {
                                "type": "countdown",
                                "data": {
                                    "challengeId": challenge_id,
                                    "startedAt": state.get("countdownStartedAt"),
                                    "seconds": challenge_service.COUNTDOWN_SECONDS,
                                },
                            },
                        )
                    await manager.send_user(challenge_id, user.id, {"type": "challenge_state", "data": state})
                    await challenge_runtime.schedule_from_state(challenge_id, state)
                    continue

                if event_type == "answer":
                    answer_event = ChallengeWSAnswerEvent.model_validate(payload)
                    async with SessionLocal() as db:
                        ack, event = await challenge_service.submit_answer(
                            challenge_id=challenge_id,
                            user_id=user.id,
                            question_id=answer_event.questionId,
                            answer=answer_event.answer,
                            db=db,
                        )
                        runtime_state = await challenge_service.get_challenge_state_for_runtime(challenge_id, db)
                    await websocket.send_json({"type": "answer_ack", "data": ack})
                    if event:
                        await manager.broadcast(challenge_id, event)
                    if runtime_state:
                        await challenge_runtime.schedule_from_state(challenge_id, runtime_state)
                    continue

                await websocket.send_json(_ws_error("Unsupported challenge event."))
            except ValidationError as exc:
                await websocket.send_json(_ws_error(exc.errors()[0].get("msg", "Invalid event."), challenge_id))
            except HTTPException as exc:
                await websocket.send_json(_ws_error(str(exc.detail), challenge_id))
            except Exception:
                logger.exception("challenge_ws_event_failed challenge_id=%s user_id=%s", challenge_id, user.id)
                await websocket.send_json(_ws_error("The challenge event could not be processed.", challenge_id))

    except WebSocketDisconnect:
        pass
    except HTTPException as exc:
        code = 4003 if exc.status_code in {401, 403} else 4404 if exc.status_code == 404 else 1011
        await websocket.close(code=code)
    except Exception:
        logger.exception("challenge_ws_failed challenge_id=%s", challenge_id)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if user is not None:
            try:
                if not socket_registered:
                    return
                await manager.disconnect(challenge_id, user.id, websocket)
                has_other_connection = await manager.user_is_connected(challenge_id, user.id)
                if not has_other_connection:
                    if SessionLocal is not None:
                        async with SessionLocal() as db:
                            await challenge_service.mark_disconnected(
                                challenge_id,
                                user.id,
                                db,
                                currently_connected_elsewhere=False,
                            )
                    await manager.broadcast(
                        challenge_id,
                        {"type": "opponent_disconnected", "data": {"challengeId": challenge_id, "userId": user.id}},
                    )
                    await challenge_runtime.schedule_disconnect_expiry(challenge_id)
            except Exception:
                logger.exception("challenge_ws_disconnect_cleanup_failed challenge_id=%s user_id=%s", challenge_id, user.id)
