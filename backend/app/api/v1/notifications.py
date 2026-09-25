"""Notifications endpoint — aggregates pending friend requests and unread chats."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.chat import Conversation, Message
from app.models.challenge import ChallengeSession
from app.models.user import User

router = APIRouter()


@router.get("/notifications")
async def get_notifications(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Return aggregated notifications for the authenticated user:
    - Conversations with unread messages
    """
    notifications = []

    # ── Unread messages ─────────────────────────────────────────────────
    my_convs = (await session.execute(
        select(Conversation.id, Conversation.user_a_id, Conversation.user_b_id).where(
            or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id)
        )
    )).all()

    conv_ids = [row[0] for row in my_convs]
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

            partner = (await session.execute(
                select(User).where(User.id == partner_id)
            )).scalar_one_or_none()
            if not partner:
                continue

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

    # ── Pending AI Quiz Battle invitations ───────────────────────────────
    pending_challenges = (await session.execute(
        select(ChallengeSession).where(
            ChallengeSession.opponent_id == user.id,
            ChallengeSession.status == "pending",
            ChallengeSession.expires_at.is_not(None),
            ChallengeSession.expires_at > datetime.now(timezone.utc),
        ).order_by(ChallengeSession.created_at.desc()).limit(20)
    )).scalars().all()

    if pending_challenges:
        challenger_ids = {c.challenger_id for c in pending_challenges}
        challengers = {
            u.id: u
            for u in (await session.execute(select(User).where(User.id.in_(challenger_ids)))).scalars().all()
        }
        for challenge in pending_challenges:
            challenger = challengers.get(challenge.challenger_id)
            if not challenger:
                continue
            notifications.append({
                "id": f"challenge_{challenge.id}",
                "type": "challenge",
                "title": "AI Quiz Battle challenge",
                "body": f"{challenger.full_name or 'A Knovi student'} challenged you on a shared learning concept.",
                "photoURL": challenger.photo_url or "",
                "linkTo": f"/app/learn/challenge/{challenge.id}",
                "createdAt": challenge.created_at.isoformat(),
                "meta": {"challengeId": challenge.id, "conceptId": challenge.concept_id},
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
