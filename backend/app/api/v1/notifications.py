"""Notifications endpoint — aggregates pending friend requests, study room invites, and unread chats."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.chat import Conversation, Message
from app.models.match import MatchRequest
from app.models.room import StudyRoom
from app.models.user import User

router = APIRouter()


@router.get("/notifications")
async def get_notifications(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Return aggregated notifications for the authenticated user:
    - Pending incoming friend requests
    - Pending study room invitations (rooms created by partner, not yet joined)
    - Conversations with unread messages
    """
    notifications = []

    # ── 1. Pending friend requests ─────────────────────────────────────────
    pending_requests = (await session.execute(
        select(MatchRequest).where(
            and_(
                MatchRequest.receiver_id == user.id,
                MatchRequest.status == "pending",
            )
        ).order_by(MatchRequest.created_at.desc()).limit(10)
    )).scalars().all()

    for req in pending_requests:
        sender = (await session.execute(
            select(User).where(User.id == req.sender_id)
        )).scalar_one_or_none()
        if not sender:
            continue
        notifications.append({
            "id": f"fr_{req.id}",
            "type": "friend_request",
            "title": f"{sender.full_name or sender.email} sent you a friend request",
            "body": f"Wants to {req.mode} {req.subject}",
            "photoURL": sender.photo_url or "",
            "linkTo": "/app/match-requests",
            "createdAt": req.created_at.isoformat(),
            "meta": {"requestId": req.id, "senderId": sender.id},
        })

    # ── 2. Pending study room invitations ──────────────────────────────────
    # Rooms where the user is NOT the creator and hasn't joined yet, not ended
    my_convs = (await session.execute(
        select(Conversation.id, Conversation.user_a_id, Conversation.user_b_id).where(
            or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id)
        )
    )).all()

    conv_ids = [row[0] for row in my_convs]
    if conv_ids:
        pending_rooms = (await session.execute(
            select(StudyRoom).where(
                and_(
                    StudyRoom.conversation_id.in_(conv_ids),
                    StudyRoom.creator_id != user.id,
                    StudyRoom.partner_joined.is_(False),
                    StudyRoom.ended_at.is_(None),
                )
            ).order_by(StudyRoom.started_at.desc()).limit(5)
        )).scalars().all()

        for room in pending_rooms:
            creator = (await session.execute(
                select(User).where(User.id == room.creator_id)
            )).scalar_one_or_none()
            if not creator:
                continue
            notifications.append({
                "id": f"room_{room.id}",
                "type": "study_invite",
                "title": f"{creator.full_name or creator.email} invited you to a study session",
                "body": f"{room.subject}{(' — ' + room.goal) if room.goal else ''}",
                "photoURL": creator.photo_url or "",
                "linkTo": f"/app/rooms",
                "createdAt": room.started_at.isoformat(),
                "meta": {"roomId": room.id},
            })

    # ── 3. Unread messages ─────────────────────────────────────────────────
    if conv_ids:
        for conv_row in my_convs:
            conv_id, user_a, user_b = conv_row
            partner_id = user_b if user_a == user.id else user_a

            unread_count = (await session.execute(
                select(func.count()).where(
                    and_(
                        Message.conversation_id == conv_id,
                        Message.sender_id == partner_id,
                        Message.is_read.is_(False),
                    )
                )
            )).scalar_one() or 0

            if unread_count == 0:
                continue

            # Get partner info
            partner = (await session.execute(
                select(User).where(User.id == partner_id)
            )).scalar_one_or_none()
            if not partner:
                continue

            # Get latest unread message for preview
            latest_msg = (await session.execute(
                select(Message).where(
                    and_(
                        Message.conversation_id == conv_id,
                        Message.sender_id == partner_id,
                        Message.is_read.is_(False),
                    )
                ).order_by(Message.created_at.desc()).limit(1)
            )).scalar_one_or_none()

            notifications.append({
                "id": f"msg_{conv_id}",
                "type": "message",
                "title": partner.full_name or partner.email,
                "body": f"{unread_count} unread message{'' if unread_count == 1 else 's'}",
                "photoURL": partner.photo_url or "",
                "linkTo": "/app/chat",
                "createdAt": latest_msg.created_at.isoformat() if latest_msg else datetime.now(timezone.utc).isoformat(),
                "meta": {"conversationId": conv_id, "unread": unread_count},
            })

    # Sort by most recent first
    notifications.sort(key=lambda n: n["createdAt"], reverse=True)

    total_unread = sum(
        n["meta"].get("unread", 1) if n["type"] == "message" else 1
        for n in notifications
    )

    return {
        "notifications": notifications,
        "total": total_unread,
    }
