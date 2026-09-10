"""Peer-matching routes: send, list, accept/decline match requests."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.match import MatchRequest
from app.models.user import User
from app.schemas.base import StrictModel

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────

class SendMatchRequestBody(StrictModel):
    receiverId: int
    mode: str          # "learn" | "teach"
    subject: str
    message: Optional[str] = None


class RespondMatchRequestBody(StrictModel):
    action: str        # "accept" | "decline"


# ── Routes ────────────────────────────────────────────────────────

@router.post("/requests")
async def send_match_request(
    body: SendMatchRequestBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Send a match request to another user."""
    if body.receiverId == user.id:
        raise HTTPException(400, "You can't send a match request to yourself.")

    # Check receiver exists
    receiver = (await session.execute(
        select(User).where(User.id == body.receiverId)
    )).scalar_one_or_none()
    if not receiver:
        raise HTTPException(404, "User not found.")

    # Block if any pending or accepted request exists in either direction
    existing = (await session.execute(
        select(MatchRequest).where(
            and_(
                or_(
                    and_(
                        MatchRequest.sender_id == user.id,
                        MatchRequest.receiver_id == body.receiverId,
                    ),
                    and_(
                        MatchRequest.sender_id == body.receiverId,
                        MatchRequest.receiver_id == user.id,
                    ),
                ),
                MatchRequest.status.in_(["pending", "accepted"]),
            )
        )
    )).scalar_one_or_none()
    if existing:
        if existing.status == "accepted":
            raise HTTPException(400, "You are already connected with this user.")
        raise HTTPException(400, "There is already a pending request between you and this user.")

    req = MatchRequest(
        sender_id=user.id,
        receiver_id=body.receiverId,
        mode=body.mode,
        subject=body.subject.strip(),
        message=body.message.strip() if body.message else None,
        status="pending",
    )
    session.add(req)
    await session.commit()
    await session.refresh(req)
    return req.serialize(user.id)


@router.get("/requests")
async def list_match_requests(
    direction: str = "incoming",   # "incoming" | "outgoing" | "all"
    status: str = "pending",       # "pending" | "accepted" | "declined" | "all"
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """List match requests for the current user."""
    q = select(MatchRequest)

    if direction == "incoming":
        q = q.where(MatchRequest.receiver_id == user.id)
    elif direction == "outgoing":
        q = q.where(MatchRequest.sender_id == user.id)
    else:
        q = q.where(or_(
            MatchRequest.sender_id == user.id,
            MatchRequest.receiver_id == user.id,
        ))

    if status != "all":
        q = q.where(MatchRequest.status == status)

    q = q.order_by(MatchRequest.created_at.desc())
    rows = (await session.execute(q)).scalars().all()
    return [r.serialize(user.id) for r in rows]


@router.patch("/requests/{req_id}")
async def respond_to_match_request(
    req_id: int,
    body: RespondMatchRequestBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Accept or decline a match request (only the receiver can do this)."""
    if body.action not in ("accept", "decline"):
        raise HTTPException(400, "action must be 'accept' or 'decline'.")

    req = (await session.execute(
        select(MatchRequest).where(MatchRequest.id == req_id)
    )).scalar_one_or_none()

    if not req:
        raise HTTPException(404, "Match request not found.")
    if req.receiver_id != user.id:
        raise HTTPException(403, "You can't respond to this request.")
    if req.status != "pending":
        raise HTTPException(400, f"Request is already {req.status}.")

    req.status = "accepted" if body.action == "accept" else "declined"

    # Auto-create a Conversation when a request is accepted.
    if req.status == "accepted":
        from app.models.chat import Conversation
        from app.services.chat_service import _pair
        a_id, b_id = _pair(user.id, req.sender_id)
        existing_conv = (await session.execute(
            select(Conversation).where(
                Conversation.user_a_id == a_id,
                Conversation.user_b_id == b_id,
            )
        )).scalar_one_or_none()
        if not existing_conv:
            session.add(Conversation(user_a_id=a_id, user_b_id=b_id, subject=req.subject))

    await session.commit()
    await session.refresh(req)
    return req.serialize(user.id)


@router.get("/accepted-partners")
async def get_accepted_partners(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Return all accepted match partners with their conversation ID (if one exists)."""
    from app.models.chat import Conversation

    accepted = (await session.execute(
        select(MatchRequest).where(
            and_(
                or_(
                    MatchRequest.sender_id == user.id,
                    MatchRequest.receiver_id == user.id,
                ),
                MatchRequest.status == "accepted",
            )
        )
    )).scalars().all()

    result = []
    for req in accepted:
        partner_id = req.receiver_id if req.sender_id == user.id else req.sender_id
        partner = (await session.execute(
            select(User).where(User.id == partner_id)
        )).scalar_one_or_none()
        if not partner:
            continue

        a_id, b_id = min(user.id, partner_id), max(user.id, partner_id)
        conv = (await session.execute(
            select(Conversation).where(
                Conversation.user_a_id == a_id,
                Conversation.user_b_id == b_id,
            )
        )).scalar_one_or_none()

        result.append({
            "partnerId": partner.id,
            "displayName": partner.full_name or partner.email,
            "photoURL": partner.photo_url or "",
            "grade": partner.grade or "",
            "isOnline": partner.is_online,
            "subject": req.subject,
            "conversationId": conv.id if conv else None,
        })

    return result


@router.get("/requests/count")
async def pending_request_count(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Quick count of pending incoming requests — used for notification badge."""
    from sqlalchemy import func
    count = (await session.execute(
        select(func.count()).where(
            and_(
                MatchRequest.receiver_id == user.id,
                MatchRequest.status == "pending",
            )
        )
    )).scalar_one()
    return {"count": count}
