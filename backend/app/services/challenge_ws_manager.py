"""In-process WebSocket room manager for AI Quiz Battle.

The database remains authoritative. This manager only delivers events to currently
connected sockets and is deliberately disposable: reconnecting clients reconstruct
state from the challenge API/database.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ChallengeConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[int, dict[int, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
        self._lock = asyncio.Lock()

    async def connect(self, challenge_id: int, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[challenge_id][user_id].add(websocket)
        logger.info("challenge_ws_connected challenge_id=%s user_id=%s", challenge_id, user_id)

    async def disconnect(self, challenge_id: int, user_id: int, websocket: WebSocket) -> bool:
        async with self._lock:
            users = self._rooms.get(challenge_id)
            if not users:
                return True
            sockets = users.get(user_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    users.pop(user_id, None)
            empty = not users
            if empty:
                self._rooms.pop(challenge_id, None)
        logger.info("challenge_ws_disconnected challenge_id=%s user_id=%s", challenge_id, user_id)
        return empty

    async def user_is_connected(self, challenge_id: int, user_id: int) -> bool:
        async with self._lock:
            return bool(self._rooms.get(challenge_id, {}).get(user_id))

    async def broadcast(self, challenge_id: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = [socket for sockets in self._rooms.get(challenge_id, {}).values() for socket in sockets]
        if not targets:
            return
        dead: list[WebSocket] = []
        for socket in targets:
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(socket)
        if dead:
            async with self._lock:
                users = self._rooms.get(challenge_id, {})
                for user_id, sockets in list(users.items()):
                    sockets.difference_update(dead)
                    if not sockets:
                        users.pop(user_id, None)
                if not users:
                    self._rooms.pop(challenge_id, None)

    async def send_user(self, challenge_id: int, user_id: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._rooms.get(challenge_id, {}).get(user_id, set()))
        dead: list[WebSocket] = []
        for socket in targets:
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(socket)
        if dead:
            async with self._lock:
                sockets = self._rooms.get(challenge_id, {}).get(user_id, set())
                sockets.difference_update(dead)

    async def connected_user_ids(self, challenge_id: int) -> set[int]:
        async with self._lock:
            return {
                user_id
                for user_id, sockets in self._rooms.get(challenge_id, {}).items()
                if sockets
            }


manager = ChallengeConnectionManager()
