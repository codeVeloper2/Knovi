"""Chat business logic.

All message bodies are encrypted at rest via crypto_service. The service layer
is the only place that calls encrypt/decrypt — routes and models never touch
plaintext directly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Conversation, Message
from app.models.user import User
from app.services import crypto_service


# ── Helpers ──────────────────────────────────────────────────────

def _pair(a: int, b: int) -> tuple[int, int]:
    """Canonical (lower, higher) id pair — ensures no duplicates."""
    return (min(a, b), max(a, b))


def _serialize_partner(user: User) -> dict:
    return {
        "id": user.id,
        "displayName": user.full_name or user.email,
        "photoURL": user.photo_url or "",
        "grade": user.grade or "",
        "isOnline": user.is_online,
        "allowDirectMessage": user.allow_direct_message,
    }


# ── Conversations ─────────────────────────────────────────────────

async def get_or_create_conversation(
    session: AsyncSession, my_id: int, partner_id: int, subject: str,
    session_goal: Optional[str] = None,
) -> Conversation:
    """Return the existing conversation, or create a new one."""
    if my_id == partner_id:
        raise HTTPException(status_code=400, detail="You can't chat with yourself.")
    a_id, b_id = _pair(my_id, partner_id)
    result = await session.execute(
        select(Conversation).where(
            Conversation.user_a_id == a_id,
            Conversation.user_b_id == b_id,
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        conv = Conversation(
            user_a_id=a_id,
            user_b_id=b_id,
            subject=subject.strip()[:80],
            session_goal=session_goal,
        )
        session.add(conv)
        await session.commit()
        await session.refresh(conv)
    return conv


async def list_conversations(session: AsyncSession, my_id: int) -> list[dict]:
    """Return all conversations for the current user, newest first."""
    result = await session.execute(
        select(Conversation).where(
            or_(Conversation.user_a_id == my_id, Conversation.user_b_id == my_id)
        ).order_by(Conversation.last_message_at.desc().nullslast())
    )
    conversations = result.scalars().all()
    if not conversations:
        return []

    # Collect partner ids
    partner_ids = {c.partner_id(my_id) for c in conversations}
    partner_rows = (await session.execute(
        select(User).where(User.id.in_(partner_ids))
    )).scalars().all()
    partners = {u.id: u for u in partner_rows}

    output = []
    for conv in conversations:
        pid = conv.partner_id(my_id)
        partner = partners.get(pid)
        if not partner:
            continue

        # Last message
        last_msg_row = (await session.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        last_msg = None
        if last_msg_row:
            is_deleted = last_msg_row.deleted_at is not None
            is_hidden = my_id in (last_msg_row.hidden_for or [])
            if is_deleted or is_hidden:
                plain = ""
            else:
                plain = crypto_service.decrypt(last_msg_row.body)
            last_msg = {
                "body": (plain[:80] + ("…" if len(plain) > 80 else "")) if plain else "",
                "attachmentUrl": None if (is_deleted or is_hidden) else last_msg_row.attachment_url,
                "attachmentName": None if (is_deleted or is_hidden) else last_msg_row.attachment_name,
                "senderId": last_msg_row.sender_id,
                "createdAt": last_msg_row.created_at.isoformat(),
                "deleted": is_deleted,
            }

        # Unread count (messages from partner that I haven't read)
        unread = (await session.execute(
            select(func.count()).where(
                and_(
                    Message.conversation_id == conv.id,
                    Message.sender_id == pid,
                    Message.is_read.is_(False),
                )
            )
        )).scalar_one()

        output.append(conv.serialize(my_id, _serialize_partner(partner), last_msg, unread))

    return output


async def get_conversation(session: AsyncSession, conv_id: int, my_id: int) -> Conversation:
    """Fetch a conversation the current user is a participant in."""
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )).scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if my_id not in (conv.user_a_id, conv.user_b_id):
        raise HTTPException(status_code=403, detail="You're not part of this conversation.")
    return conv


# ── Messages ──────────────────────────────────────────────────────

async def get_messages(
    session: AsyncSession, conv_id: int, my_id: int,
    before_id: Optional[int] = None, limit: int = 50,
) -> list[dict]:
    """Return messages for a conversation (oldest-first, paginated via before_id)."""
    await get_conversation(session, conv_id, my_id)

    q = select(Message).where(Message.conversation_id == conv_id)
    if before_id is not None:
        q = q.where(Message.id < before_id)
    q = q.order_by(Message.created_at.desc()).limit(limit)

    rows = (await session.execute(q)).scalars().all()
    rows = list(reversed(rows))  # oldest first after limiting from the top

    return [m.serialize(crypto_service.decrypt(m.body), viewer_id=my_id) for m in rows]


async def send_message(
    session: AsyncSession,
    conv_id: int,
    sender_id: int,
    body: str,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
    reply_to_id: Optional[int] = None,
) -> Message:
    """Encrypt and persist a message; update conversation.last_message_at."""
    conv = await get_conversation(session, conv_id, sender_id)

    if not body.strip() and not attachment_url:
        raise HTTPException(status_code=400, detail="Message can't be empty.")

    # Resolve reply snapshot (plain-text preview of the quoted message)
    reply_snapshot: Optional[str] = None
    if reply_to_id is not None:
        quoted = (await session.execute(
            select(Message).where(Message.id == reply_to_id)
        )).scalar_one_or_none()
        if quoted and quoted.deleted_at is None:
            plain = crypto_service.decrypt(quoted.body)
            reply_snapshot = plain[:120] + ("…" if len(plain) > 120 else "")

    encrypted = crypto_service.encrypt(body.strip())
    msg = Message(
        conversation_id=conv_id,
        sender_id=sender_id,
        body=encrypted,
        attachment_url=attachment_url,
        attachment_name=attachment_name,
        reply_to_id=reply_to_id,
        reply_to_snapshot=reply_snapshot,
    )
    session.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(msg)
    return msg


async def delete_message(
    session: AsyncSession, msg_id: int, requester_id: int, scope: str = "everyone"
) -> Message:
    """Delete a message.
    scope='everyone' — soft-deletes for all viewers (sets deleted_at).
    scope='me'       — hides only for the requester (adds to hidden_for array).
    Only the sender can delete their own message.
    """
    msg = (await session.execute(
        select(Message).where(Message.id == msg_id)
    )).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    if msg.sender_id != requester_id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages.")

    if scope == "everyone":
        if msg.deleted_at is not None:
            return msg  # already deleted for everyone
        msg.deleted_at = datetime.now(timezone.utc)
    else:
        # scope == "me" — append to hidden_for array
        hidden: list = list(msg.hidden_for or [])
        if requester_id not in hidden:
            hidden.append(requester_id)
        msg.hidden_for = hidden
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(msg, "hidden_for")

    await session.commit()
    await session.refresh(msg)
    return msg


async def toggle_reaction(
    session: AsyncSession, msg_id: int, user_id: int, emoji: str
) -> Message:
    """Add or remove a reaction emoji for the given user on a message."""
    ALLOWED = {"👍", "❤️", "😂", "😮", "🙏", "🔥"}
    if emoji not in ALLOWED:
        raise HTTPException(status_code=400, detail="Emoji not allowed.")

    msg = (await session.execute(
        select(Message).where(Message.id == msg_id)
    )).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")

    reactions: dict = dict(msg.reactions or {})
    users: list = list(reactions.get(emoji, []))

    if user_id in users:
        users.remove(user_id)  # toggle off
    else:
        users.append(user_id)  # toggle on

    if users:
        reactions[emoji] = users
    else:
        reactions.pop(emoji, None)

    msg.reactions = reactions if reactions else None
    # Force SQLAlchemy to detect the JSON mutation
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(msg, "reactions")
    await session.commit()
    await session.refresh(msg)
    return msg


async def mark_delivered(session: AsyncSession, conv_id: int, receiver_id: int) -> list[int]:
    """Mark all undelivered messages from the *other* participant as delivered.
    Returns the list of message ids that were just marked delivered."""
    conv = await get_conversation(session, conv_id, receiver_id)
    partner = conv.partner_id(receiver_id)

    # Fetch ids of messages to update
    rows = (await session.execute(
        select(Message.id).where(
            and_(
                Message.conversation_id == conv_id,
                Message.sender_id == partner,
                Message.is_delivered.is_(False),
            )
        )
    )).scalars().all()

    if rows:
        await session.execute(
            Message.__table__.update()
            .where(
                and_(
                    Message.conversation_id == conv_id,
                    Message.sender_id == partner,
                    Message.is_delivered.is_(False),
                )
            )
            .values(is_delivered=True)
        )
        await session.commit()

    return list(rows)


async def mark_read(session: AsyncSession, conv_id: int, reader_id: int) -> None:
    """Mark all unread messages from the *other* participant as read."""
    conv = await get_conversation(session, conv_id, reader_id)
    partner = conv.partner_id(reader_id)

    await session.execute(
        Message.__table__.update()
        .where(
            and_(
                Message.conversation_id == conv_id,
                Message.sender_id == partner,
                Message.is_read.is_(False),
            )
        )
        .values(is_read=True)
    )
    await session.commit()


async def set_session_goal(
    session: AsyncSession, conv_id: int, my_id: int, goal: str
) -> Conversation:
    conv = await get_conversation(session, conv_id, my_id)
    conv.session_goal = goal.strip() or None
    await session.commit()
    await session.refresh(conv)
    return conv


async def report_message(
    session: AsyncSession, msg_id: int, reporter_id: int
) -> None:
    msg = (await session.execute(
        select(Message).where(Message.id == msg_id)
    )).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    # Only a participant of the conversation can report.
    conv = await get_conversation(session, msg.conversation_id, reporter_id)
    _ = conv  # just verifying access
    msg.reported = True
    await session.commit()


async def search_users(
    session: AsyncSession, query: str, my_id: int, limit: int = 20
) -> list[dict]:
    """Search users by name or email (for starting a new chat)."""
    like = f"%{query.strip().lower()}%"
    rows = (await session.execute(
        select(User).where(
            and_(
                User.id != my_id,
                User.profile_complete.is_(True),
                or_(
                    func.lower(User.full_name).like(like),
                    func.lower(User.email).like(like),
                )
            )
        ).limit(limit)
    )).scalars().all()
    return [_serialize_partner(u) for u in rows]
