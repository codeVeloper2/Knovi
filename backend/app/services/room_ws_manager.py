"""WebSocket connection manager for Study Rooms.

Separate from the chat manager so room broadcasts don't interfere with chat.
Same architecture — keyed by room_id instead of conversation_id.
"""
from __future__ import annotations

import json
from collections import defaultdict

from fastapi import WebSocket


class RoomConnectionManager:
    def __init__(self) -> None:
        # room_id -> list[WebSocket]
        self._rooms: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, ws: WebSocket, room_id: int) -> None:
        await ws.accept()
        self._rooms[room_id].append(ws)

    def disconnect(self, ws: WebSocket, room_id: int) -> None:
        room = self._rooms.get(room_id, [])
        if ws in room:
            room.remove(ws)
        if not room:
            self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: int, payload: dict, exclude: WebSocket | None = None) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_id, [])):
            if ws is exclude:
                continue
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room_id)

    async def broadcast_all(self, room_id: int, payload: dict) -> None:
        """Broadcast to every connected client including the sender."""
        await self.broadcast(room_id, payload, exclude=None)

    def connected_count(self, room_id: int) -> int:
        return len(self._rooms.get(room_id, []))


room_manager = RoomConnectionManager()
