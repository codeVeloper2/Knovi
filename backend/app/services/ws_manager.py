"""In-process WebSocket connection manager.

Keeps track of open WebSocket connections keyed by conversation_id. When a
message is sent, it's broadcast to every connected client in that conversation
(at most 2 users for 1-on-1 chats).

For a single-server deployment this is sufficient. To scale across multiple
workers/servers, replace `_rooms` with a Redis pub/sub broadcast layer.
"""
from __future__ import annotations

import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # conversation_id -> list of active WebSocket connections
        self._rooms: dict[int, list[WebSocket]] = defaultdict(list)
        # user_id -> set of conversation_ids they are connected to
        self._user_convs: dict[int, set[int]] = defaultdict(set)

    async def connect(self, ws: WebSocket, conversation_id: int, user_id: int | None = None) -> None:
        await ws.accept()
        self._rooms[conversation_id].append(ws)
        if user_id is not None:
            self._user_convs[user_id].add(conversation_id)

    def disconnect(self, ws: WebSocket, conversation_id: int, user_id: int | None = None) -> None:
        room = self._rooms.get(conversation_id, [])
        if ws in room:
            room.remove(ws)
        if not room:
            self._rooms.pop(conversation_id, None)
        if user_id is not None:
            self._user_convs[user_id].discard(conversation_id)

    def is_connected(self, user_id: int, conversation_id: int) -> bool:
        """Return True if the given user has an active WS in this conversation."""
        return conversation_id in self._user_convs.get(user_id, set())

    async def broadcast(self, conversation_id: int, payload: dict) -> None:
        """Send a JSON payload to all connected clients in the conversation."""
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(conversation_id, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:  # noqa: BLE001 — client disconnected
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, conversation_id)


# Singleton — imported by the chat routes module.
manager = ConnectionManager()
