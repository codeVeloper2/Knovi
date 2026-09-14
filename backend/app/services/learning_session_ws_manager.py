"""In-process realtime fan-out for Learning Session state events.

This deliberately mirrors the existing chat manager without changing it.  It
is suitable for the current single-worker deployment; multi-worker deployments
need a shared pub/sub transport for both managers.
"""
from __future__ import annotations

import json
from collections import defaultdict
from fastapi import WebSocket


class LearningSessionConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, session_id: int) -> None:
        await websocket.accept()
        self._rooms[session_id].append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: int) -> None:
        room = self._rooms.get(session_id, [])
        if websocket in room:
            room.remove(websocket)
        if not room:
            self._rooms.pop(session_id, None)

    async def broadcast(self, session_id: int, event: str, payload: dict | None = None) -> None:
        message = json.dumps({"type": event, "data": payload or {}})
        dead: list[WebSocket] = []
        for websocket in list(self._rooms.get(session_id, [])):
            try:
                await websocket.send_text(message)
            except Exception:  # disconnected client
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(websocket, session_id)


manager = LearningSessionConnectionManager()
