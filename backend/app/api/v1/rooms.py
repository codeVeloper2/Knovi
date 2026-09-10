"""Study Room routes — REST + WebSocket."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user, decode_token
from app.models.user import User
from app.schemas.base import StrictModel
from app.services import room_service, storage_service
from app.services.room_ws_manager import room_manager

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────

class CreateRoomRequest(StrictModel):
    conversationId: int
    goal: Optional[str] = None
    role: Optional[str] = None      # "teaching" | "learning"
    subject: Optional[str] = None   # override conversation subject


class UpdateNotesRequest(StrictModel):
    notes: str


class UpdateWhiteboardRequest(StrictModel):
    strokes: list


class EndRoomRequest(StrictModel):
    rating: Optional[int] = None


class AddMaterialLinkRequest(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=10, max_length=2048)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://") and not v.startswith("http://"):
            raise ValueError("url must be a valid HTTP/HTTPS URL")
        return v


# ── REST endpoints ────────────────────────────────────────────────────────

@router.post("/rooms")
async def create_room(
    body: CreateRoomRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.create_room(
        session, body.conversationId, user.id, body.goal, body.role, body.subject
    )
    # Notify partner via chat WebSocket that a room was created
    from app.services.ws_manager import manager as chat_manager
    await chat_manager.broadcast(body.conversationId, {
        "type": "study_room_created",
        "roomId": room.id,
        "creatorId": user.id,
        "goal": room.goal,
    })
    return room.serialize(user.id)


@router.get("/rooms/active")
async def get_active_room(
    conversationId: int = Query(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.get_active_room(session, conversationId, user.id)
    if room is None:
        return {"active": False}
    return {"active": True, "room": room.serialize(user.id)}


@router.get("/rooms/recent")
async def get_recent_rooms(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Get all recent study rooms for the current user (across all conversations)."""
    rooms = await room_service.list_all_rooms_for_user(session, user.id)
    return [r.serialize(user.id) for r in rooms]


@router.get("/rooms/pending/count")
async def get_pending_invitations_count(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Quick count of pending study room invitations — for sidebar badge."""
    invitations = await room_service.get_pending_invitations(session, user.id)
    return {"count": len(invitations)}


@router.get("/rooms/pending")
async def get_pending_invitations(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Return study room invitations waiting for this user to join."""
    return await room_service.get_pending_invitations(session, user.id)


@router.post("/rooms/{room_id}/decline")
async def decline_invitation(
    room_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Decline a study room invitation (invited partner only)."""
    await room_service.decline_invitation(session, room_id, user.id)
    # Notify creator that invitation was declined
    from app.services.room_ws_manager import room_manager
    await room_manager.broadcast_all(room_id, {
        "type": "invitation_declined",
        "roomId": room_id,
    })
    return {"ok": True}


@router.get("/rooms/{room_id}")
async def get_room(
    room_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.get_room(session, room_id, user.id)
    return room.serialize(user.id)


@router.post("/rooms/{room_id}/join")
async def join_room(
    room_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.join_room(session, room_id, user.id)
    payload = room.serialize(user.id)
    # Notify creator that partner joined
    await room_manager.broadcast_all(room_id, {"type": "partner_joined", "room": payload})
    return payload


@router.post("/rooms/{room_id}/end")
async def end_room(
    room_id: int,
    body: EndRoomRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.end_room(session, room_id, user.id, body.rating)
    payload = room.serialize(user.id)
    # Notify both participants
    await room_manager.broadcast_all(room_id, {"type": "session_ended", "room": payload})
    return payload


@router.patch("/rooms/{room_id}/notes")
async def update_notes(
    room_id: int,
    body: UpdateNotesRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.update_notes(session, room_id, user.id, body.notes)
    return {"ok": True, "notes": room.notes}


@router.patch("/rooms/{room_id}/whiteboard")
async def update_whiteboard(
    room_id: int,
    body: UpdateWhiteboardRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    room = await room_service.update_whiteboard(session, room_id, user.id, body.strokes)
    return {"ok": True}


# ── Materials ─────────────────────────────────────────────────────────────

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
                 "application/pdf", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                 "application/vnd.ms-powerpoint",
                 "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                 "application/vnd.ms-excel",
                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                 "text/plain", "text/csv"}
MAX_MATERIAL_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/rooms/{room_id}/materials/upload")
async def upload_material(
    room_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    data = await file.read()
    if len(data) > MAX_MATERIAL_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 20 MB).")

    content_type = file.content_type or "application/octet-stream"
    original_name = file.filename or "upload"

    # Determine file_type category
    if content_type.startswith("image/"):
        file_type = "image"
    elif content_type == "application/pdf":
        file_type = "pdf"
    else:
        file_type = "file"

    # Reuse Supabase storage — upload to a rooms/ subfolder
    base = storage_service.settings.SUPABASE_URL
    key = storage_service.settings.SUPABASE_SERVICE_KEY
    bucket = storage_service.settings.SUPABASE_AVATAR_BUCKET  # reuse same bucket

    if not base or not key:
        raise HTTPException(status_code=503, detail="Storage isn't configured.")

    import httpx
    ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "bin"
    path = f"rooms/{room_id}/{uuid.uuid4().hex}.{ext}"
    upload_url = f"{base}/storage/v1/object/{bucket}/{path}"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": content_type,
        "x-upsert": "true",
        "cache-control": "3600",
    }

    try:
        resp = await run_in_threadpool(
            lambda: httpx.post(upload_url, content=data, headers=headers, timeout=30.0)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Storage error: {resp.text[:200]}")

    url = f"{base}/storage/v1/object/public/{bucket}/{path}"

    mat = await room_service.add_material(
        session, room_id, user.id, original_name, url, file_type, len(data)
    )
    payload = mat.serialize()
    await room_manager.broadcast_all(room_id, {"type": "material_added", "material": payload})
    return payload


@router.post("/rooms/{room_id}/materials/link")
async def add_material_link(
    room_id: int,
    body: AddMaterialLinkRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    mat = await room_service.add_material(
        session, room_id, user.id, body.name, body.url, "link", None
    )
    payload = mat.serialize()
    await room_manager.broadcast_all(room_id, {"type": "material_added", "material": payload})
    return payload


@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Soft-delete a session from the current user's history (partner still sees it)."""
    await room_service.hide_room(session, room_id, user.id)
    return {"ok": True}


@router.delete("/rooms/{room_id}/materials/{material_id}")
async def delete_material(
    room_id: int,
    material_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await room_service.delete_material(session, material_id, user.id)
    await room_manager.broadcast_all(room_id, {"type": "material_removed", "materialId": material_id})
    return {"ok": True}


# ── WebSocket ─────────────────────────────────────────────────────────────

_MAX_WS_BYTES = 512 * 1024  # 512 KB per message


@router.websocket("/rooms/ws/{room_id}")
async def room_ws(
    room_id: int,
    websocket: WebSocket,
    token: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Real-time channel for a study room."""
    # Auth
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        await websocket.close(code=4001)
        return

    # Verify the user is actually a participant in this room
    try:
        await room_service.get_room(session, room_id, user_id)
    except HTTPException:
        await websocket.close(code=4003)
        return

    await room_manager.connect(websocket, room_id)
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > _MAX_WS_BYTES:
                continue  # silently drop oversized messages
            try:
                import json
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "ping":
                await websocket.send_text('{"type":"pong"}')

            elif msg_type == "notes_update":
                # Broadcast to partner only
                await room_manager.broadcast(room_id, {
                    "type": "notes_update",
                    "notes": msg.get("notes", ""),
                    "userId": user_id,
                }, exclude=websocket)

            elif msg_type == "whiteboard_op":
                # Broadcast stroke/clear to partner
                await room_manager.broadcast(room_id, {
                    "type": "whiteboard_op",
                    "op": msg.get("op"),  # { kind: "stroke"|"clear"|"undo", data: ... }
                    "userId": user_id,
                }, exclude=websocket)

            elif msg_type == "timer_sync":
                # Broadcast timer control event to partner (pass all fields through)
                await room_manager.broadcast(room_id, {
                    "type": "timer_sync",
                    "action": msg.get("action"),
                    "remaining": msg.get("remaining"),
                    "phase": msg.get("phase"),
                    "focusSecs": msg.get("focusSecs"),
                    "breakSecs": msg.get("breakSecs"),
                    "userId": user_id,
                }, exclude=websocket)

            elif msg_type == "cursor":
                # Optional: broadcast partner cursor position on whiteboard
                await room_manager.broadcast(room_id, {
                    "type": "cursor",
                    "x": msg.get("x"),
                    "y": msg.get("y"),
                    "userId": user_id,
                }, exclude=websocket)

    except WebSocketDisconnect:
        room_manager.disconnect(websocket, room_id)
