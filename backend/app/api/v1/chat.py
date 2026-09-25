"""Chat routes: conversations, messages (REST + WebSocket), attachments."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select as sa_select

from app.core.database import get_session
from app.core.security import current_user, decode_token
from app.models.user import User
from app.models.chat import Message
from app.schemas.base import StrictModel
from app.services import chat_service, crypto_service, storage_service
from app.services.ws_manager import manager
from app.core.config import settings

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────

class StartConversationRequest(StrictModel):
    partnerId: int
    subject: str
    sessionGoal: Optional[str] = None


class SendMessageRequest(StrictModel):
    body: str = ""
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None
    replyToId: Optional[int] = None


class ReactionRequest(StrictModel):
    emoji: str


class SetGoalRequest(StrictModel):
    goal: str


# ── Conversation endpoints ────────────────────────────────────────

@router.get("/chat/conversations")
async def list_conversations(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await chat_service.list_conversations(session, user.id)


@router.post("/chat/conversations")
async def start_conversation(
    body: StartConversationRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from sqlalchemy import select as sa_select
    # ── Privacy check ─────────────────────────────────────────────
    # If the partner has allowDirectMessage = False, they cannot be
    # messaged directly. The caller must go through a match request first.
    # An existing accepted conversation bypasses this check (chat already open).
    from app.models.chat import Conversation
    from app.services.chat_service import _pair
    a_id, b_id = _pair(user.id, body.partnerId)
    existing = (await session.execute(
        sa_select(Conversation).where(
            Conversation.user_a_id == a_id,
            Conversation.user_b_id == b_id,
        )
    )).scalar_one_or_none()

    if existing is None:
        # Honour the partner's privacy setting.
        partner = (await session.execute(
            sa_select(User).where(User.id == body.partnerId)
        )).scalar_one_or_none()
        if partner and not partner.allow_direct_message:
            raise HTTPException(
                status_code=403,
                detail="This student does not accept direct messages."
            )

    conv = await chat_service.get_or_create_conversation(
        session, user.id, body.partnerId, body.subject, body.sessionGoal
    )
    # Return full conversation detail for the new chat.
    convs = await chat_service.list_conversations(session, user.id)
    match = next((c for c in convs if c["id"] == conv.id), None)
    return match or {"id": conv.id, "subject": conv.subject}


@router.post("/chat/conversations/{conv_id}/goal")
async def set_goal(
    conv_id: int,
    body: SetGoalRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    conv = await chat_service.set_session_goal(session, conv_id, user.id, body.goal)
    return {"ok": True, "sessionGoal": conv.session_goal}


@router.patch("/chat/conversations/{conv_id}/read")
async def mark_read(
    conv_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await chat_service.mark_read(session, conv_id, user.id)
    # Broadcast to the sender that their messages have been read
    await manager.broadcast(conv_id, {"type": "read", "userId": user.id})
    return {"ok": True}


# ── Message endpoints ─────────────────────────────────────────────

@router.get("/chat/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: int,
    before_id: Optional[int] = Query(None),
    limit: int = Query(50, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await chat_service.get_messages(session, conv_id, user.id, before_id, limit)


@router.post("/chat/conversations/{conv_id}/messages")
async def send_message(
    conv_id: int,
    body: SendMessageRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """REST fallback send (used when WebSocket isn't available)."""
    msg = await chat_service.send_message(
        session, conv_id, user.id, body.body,
        body.attachmentUrl, body.attachmentName, body.replyToId,
    )
    payload = msg.serialize(crypto_service.decrypt(msg.body))
    await manager.broadcast(conv_id, {"type": "message", "data": payload})
    return payload


@router.delete("/chat/messages/{msg_id}")
async def delete_message(
    msg_id: int,
    scope: str = Query(default="everyone", pattern="^(me|everyone)$"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    msg = await chat_service.delete_message(session, msg_id, user.id, scope=scope)
    # Only broadcast a "deleted" event to the partner when deleting for everyone
    if scope == "everyone":
        payload = {"type": "deleted", "msgId": msg_id, "conversationId": msg.conversation_id}
        await manager.broadcast(msg.conversation_id, payload)
    return {"ok": True}


@router.post("/chat/messages/{msg_id}/react")
async def react_message(
    msg_id: int,
    body: ReactionRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    msg = await chat_service.toggle_reaction(session, msg_id, user.id, body.emoji)
    payload = {
        "type": "reaction",
        "msgId": msg_id,
        "reactions": msg.reactions or {},
        "conversationId": msg.conversation_id,
    }
    await manager.broadcast(msg.conversation_id, payload)
    return {"ok": True, "reactions": msg.reactions or {}}


_ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf", "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("/chat/conversations/{conv_id}/attachment")
async def upload_attachment(
    conv_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upload a file attachment and return its public URL."""
    await chat_service.get_conversation(session, conv_id, user.id)

    content_type = file.content_type or "application/octet-stream"
    # Some mobile browsers/file pickers report documents as octet-stream or
    # omit the MIME type entirely. Fall back to the filename extension.
    if content_type not in _ALLOWED_ATTACHMENT_TYPES:
        import mimetypes
        guessed_type, _ = mimetypes.guess_type(file.filename or "")
        if guessed_type in _ALLOWED_ATTACHMENT_TYPES:
            content_type = guessed_type
    if content_type not in _ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=400, detail="File type not allowed.")

    data = await file.read()
    if len(data) > _MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 25 MB).")
    # Reuse the storage service but put attachments in a separate folder.
    url = await run_in_threadpool(
        _upload_attachment, user.id, conv_id, data, content_type, file.filename or "file"
    )
    return {"url": url, "name": file.filename}


def _upload_attachment(
    user_id: int, conv_id: int, data: bytes, content_type: str, filename: str
) -> str:
    import uuid
    from urllib.parse import quote
    from app.core.config import settings
    import httpx

    base = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_KEY
    bucket = settings.SUPABASE_AVATAR_BUCKET
    ext = filename.rsplit(".", 1)[-1][:10] if "." in filename else "bin"
    path = f"chat/{conv_id}/{uuid.uuid4().hex}.{ext}"
    resp = httpx.post(
        f"{base}/storage/v1/object/{bucket}/{path}",
        content=data,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        timeout=30.0,
    )
    if resp.status_code not in (200, 201):
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=f"Attachment upload failed: {resp.text}")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


@router.get("/chat/messages/{msg_id}/attachment")
async def download_attachment(
    msg_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Download a chat attachment through the authenticated API.

    The browser receives the file as an attachment instead of navigating to
    the public Supabase storage URL.
    """
    from fastapi.responses import Response
    import httpx
    from urllib.parse import urlparse

    msg = (await session.execute(
        sa_select(Message).where(Message.id == msg_id)
    )).scalar_one_or_none()
    if msg is None or not msg.attachment_url:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    # get_conversation also verifies that the requester belongs to the chat.
    await chat_service.get_conversation(session, msg.conversation_id, user.id)

    parsed = urlparse(msg.attachment_url)
    expected_host = urlparse(settings.SUPABASE_URL).netloc if 'settings' in globals() else parsed.netloc
    if parsed.scheme not in {"http", "https"} or parsed.netloc != expected_host:
        raise HTTPException(status_code=400, detail="Invalid attachment URL.")

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        upstream = await client.get(msg.attachment_url)

    if upstream.status_code != 200:
        raise HTTPException(status_code=502, detail="Attachment download failed.")

    media_type = upstream.headers.get("content-type", "application/octet-stream").split(";")[0]
    filename = (msg.attachment_name or "Knovi-file").replace('"', "_").replace("\\", "_").replace("/", "_")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
    }
    return Response(content=upstream.content, media_type=media_type, headers=headers)


@router.post("/chat/messages/{msg_id}/report")
async def report_message(
    msg_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await chat_service.report_message(session, msg_id, user.id)
    return {"ok": True}


# ── User search (for starting a new chat) ────────────────────────

@router.get("/chat/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await chat_service.search_users(session, q, user.id)


# ── WebSocket ─────────────────────────────────────────────────────

@router.websocket("/chat/ws/{conv_id}")
async def websocket_endpoint(
    ws: WebSocket,
    conv_id: int,
    token: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Real-time message channel for a conversation.

    Auth: pass the JWT as ?token=<jwt> in the WS URL (browsers can't set
    Authorization headers on WebSocket connections).
    """
    # Authenticate via token query param.
    try:
        payload = decode_token(token)
        user_id: int = int(payload["sub"])
    except Exception:
        await ws.close(code=4001)
        return

    # Verify participant.
    try:
        await chat_service.get_conversation(session, conv_id, user_id)
    except Exception:
        await ws.close(code=4003)
        return

    await manager.connect(ws, conv_id, user_id)
    try:
        # ── Mark undelivered messages as delivered immediately on connect ──
        delivered_ids = await chat_service.mark_delivered(session, conv_id, user_id)
        if delivered_ids:
            await manager.broadcast(conv_id, {
                "type": "delivered",
                "userId": user_id,
                "msgIds": delivered_ids,
            })

        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except ValueError:
                continue

            msg_type = data.get("type")
            if msg_type == "message":
                body = str(data.get("body", "")).strip()
                attachment_url = data.get("attachmentUrl")
                attachment_name = data.get("attachmentName")
                reply_to_id = data.get("replyToId")
                if not body and not attachment_url:
                    continue
                msg = await chat_service.send_message(
                    session, conv_id, user_id, body,
                    attachment_url, attachment_name, reply_to_id,
                )
                payload = msg.serialize(crypto_service.decrypt(msg.body))

                # If the partner is already connected to this room, mark delivered immediately
                conv = await chat_service.get_conversation(session, conv_id, user_id)
                partner_id = conv.partner_id(user_id)
                if manager.is_connected(partner_id, conv_id):
                    await chat_service.mark_delivered(session, conv_id, partner_id)
                    payload["isDelivered"] = True

                await manager.broadcast(conv_id, {"type": "message", "data": payload})

            elif msg_type == "read":
                await chat_service.mark_read(session, conv_id, user_id)
                await manager.broadcast(conv_id, {"type": "read", "userId": user_id})

            elif msg_type == "typing":
                # Forward typing indicator to the other participant.
                await manager.broadcast(conv_id, {"type": "typing", "userId": user_id})

    except WebSocketDisconnect:
        manager.disconnect(ws, conv_id, user_id)
