"""Study Room service — business logic."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Conversation
from app.models.room import RoomMaterial, StudyRoom
from app.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _get_room_or_404(session: AsyncSession, room_id: int) -> StudyRoom:
    room = (await session.execute(
        select(StudyRoom).where(StudyRoom.id == room_id)
    )).scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Study room not found.")
    return room


async def _assert_participant(session: AsyncSession, room: StudyRoom, user_id: int) -> None:
    """Raise 403 if user_id is not a participant in this room's conversation."""
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == room.conversation_id)
    )).scalar_one_or_none()
    if conv is None or user_id not in (conv.user_a_id, conv.user_b_id):
        raise HTTPException(status_code=403, detail="You are not a participant in this study room.")


# ── Create / open a room ───────────────────────────────────────────────────

async def create_room(
    session: AsyncSession,
    conversation_id: int,
    creator_id: int,
    goal: Optional[str],
    creator_role: Optional[str] = None,
    subject_override: Optional[str] = None,
) -> StudyRoom:
    """Create a new study room for the given conversation.

    If an active (not ended) room already exists for this conversation,
    return it instead of creating a duplicate.
    """
    # Verify the creator is part of this conversation
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )).scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if creator_id not in (conv.user_a_id, conv.user_b_id):
        raise HTTPException(status_code=403, detail="You are not part of this conversation.")

    # Check for existing active room
    existing = (await session.execute(
        select(StudyRoom).where(
            StudyRoom.conversation_id == conversation_id,
            StudyRoom.ended_at.is_(None),
        )
    )).scalar_one_or_none()
    if existing is not None:
        return existing

    room = StudyRoom(
        conversation_id=conversation_id,
        creator_id=creator_id,
        goal=goal,
        subject=(subject_override.strip()[:80] if subject_override else conv.subject),
        creator_role=creator_role,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


async def get_active_room(
    session: AsyncSession,
    conversation_id: int,
    user_id: int,
) -> Optional[StudyRoom]:
    """Return the active (not ended) study room for a conversation, or None."""
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )).scalar_one_or_none()
    if conv is None or user_id not in (conv.user_a_id, conv.user_b_id):
        return None
    return (await session.execute(
        select(StudyRoom).where(
            StudyRoom.conversation_id == conversation_id,
            StudyRoom.ended_at.is_(None),
        )
    )).scalar_one_or_none()


async def get_room(session: AsyncSession, room_id: int, user_id: int) -> StudyRoom:
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    return room


async def join_room(session: AsyncSession, room_id: int, user_id: int) -> StudyRoom:
    """Mark the partner as having joined."""
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    if room.ended_at is not None:
        raise HTTPException(status_code=400, detail="This study session has already ended.")
    if not room.partner_joined and user_id != room.creator_id:
        room.partner_joined = True
        await session.commit()
        await session.refresh(room)
    return room


async def end_room(
    session: AsyncSession,
    room_id: int,
    user_id: int,
    rating: Optional[int] = None,
) -> StudyRoom:
    """End the session, record duration, optionally save rating."""
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    if room.ended_at is not None:
        # Already ended — just update rating if provided
        if rating is not None:
            if user_id == room.creator_id:
                room.rating_by_creator = max(1, min(5, rating))
            else:
                room.rating_by_partner = max(1, min(5, rating))
            await session.commit()
            await session.refresh(room)
            # Update rated user's profile
            await _update_user_rating(session, room, user_id)
        return room

    now = _now()
    room.ended_at = now
    elapsed = (now - room.started_at).total_seconds()
    room.duration_minutes = max(1, math.ceil(elapsed / 60))

    if rating is not None:
        if user_id == room.creator_id:
            room.rating_by_creator = max(1, min(5, rating))
        else:
            room.rating_by_partner = max(1, min(5, rating))

    await session.commit()
    await session.refresh(room)

    # Increment session_count on both participants
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == room.conversation_id)
    )).scalar_one_or_none()
    if conv:
        for uid in (conv.user_a_id, conv.user_b_id):
            u = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
            if u:
                u.session_count = (u.session_count or 0) + 1
                u.xp = (u.xp or 0) + 50
        await session.commit()

    # Update rating for the rated user
    if rating is not None:
        await _update_user_rating(session, room, user_id)

    return room


async def _update_user_rating(session: AsyncSession, room: StudyRoom, rater_id: int) -> None:
    """Update the partner's rating and review_count after receiving a rating."""
    # Get conversation to find who is being rated
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == room.conversation_id)
    )).scalar_one_or_none()
    if not conv:
        return

    # The rated user is the partner (not the rater)
    rated_user_id = conv.user_b_id if conv.user_a_id == rater_id else conv.user_a_id
    rated_user = (await session.execute(
        select(User).where(User.id == rated_user_id)
    )).scalar_one_or_none()
    if not rated_user:
        return

    # Get the rating value
    rating_value = room.rating_by_creator if rater_id == room.creator_id else room.rating_by_partner
    if rating_value is None:
        return

    # Update: new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
    old_count = rated_user.review_count or 0
    old_rating = rated_user.rating or 0  # stored as int (0-50 scale, so multiply by 10)
    new_count = old_count + 1
    # Convert rating (1-5) to storage format (*10 → 10-50)
    new_rating_stored = rating_value * 10
    # Calculate new average
    new_avg = ((old_rating * old_count) + new_rating_stored) // new_count if new_count > 0 else new_rating_stored

    rated_user.rating = new_avg
    rated_user.review_count = new_count
    await session.commit()


# ── Notes sync ─────────────────────────────────────────────────────────────

async def update_notes(
    session: AsyncSession,
    room_id: int,
    user_id: int,
    notes: str,
) -> StudyRoom:
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    if room.ended_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit notes after the session has ended.")
    room.notes = notes
    await session.commit()
    await session.refresh(room)
    return room


# ── Whiteboard sync ────────────────────────────────────────────────────────

async def update_whiteboard(
    session: AsyncSession,
    room_id: int,
    user_id: int,
    strokes: list,
) -> StudyRoom:
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    if room.ended_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit whiteboard after the session has ended.")
    room.whiteboard = strokes
    await session.commit()
    await session.refresh(room)
    return room


# ── Materials ──────────────────────────────────────────────────────────────

async def add_material(
    session: AsyncSession,
    room_id: int,
    uploader_id: int,
    name: str,
    url: str,
    file_type: str,
    size_bytes: Optional[int],
) -> RoomMaterial:
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, uploader_id)
    mat = RoomMaterial(
        room_id=room_id,
        uploader_id=uploader_id,
        name=name,
        url=url,
        file_type=file_type,
        size_bytes=size_bytes,
    )
    session.add(mat)
    await session.commit()
    await session.refresh(mat)
    return mat


async def delete_material(
    session: AsyncSession,
    material_id: int,
    user_id: int,
) -> None:
    mat = (await session.execute(
        select(RoomMaterial).where(RoomMaterial.id == material_id)
    )).scalar_one_or_none()
    if mat is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    room = await _get_room_or_404(session, mat.room_id)
    await _assert_participant(session, room, user_id)
    await session.delete(mat)
    await session.commit()


# ── History ────────────────────────────────────────────────────────────────

async def list_rooms_for_conversation(
    session: AsyncSession,
    conversation_id: int,
    user_id: int,
) -> list[StudyRoom]:
    """Return all rooms for a conversation (newest first)."""
    conv = (await session.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )).scalar_one_or_none()
    if conv is None or user_id not in (conv.user_a_id, conv.user_b_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    result = await session.execute(
        select(StudyRoom)
        .where(StudyRoom.conversation_id == conversation_id)
        .order_by(StudyRoom.started_at.desc())
    )
    return list(result.scalars().all())


async def list_all_rooms_for_user(
    session: AsyncSession,
    user_id: int,
) -> list[StudyRoom]:
    """Return all study rooms the user participated in (newest first), across all conversations."""
    convs = (await session.execute(
        select(Conversation).where(
            (Conversation.user_a_id == user_id) | (Conversation.user_b_id == user_id)
        )
    )).scalars().all()
    conv_ids = [c.id for c in convs]
    if not conv_ids:
        return []
    creator_conv_ids = {c.id for c in convs if c.user_a_id == user_id or c.user_b_id == user_id}

    all_rooms = (await session.execute(
        select(StudyRoom)
        .where(StudyRoom.conversation_id.in_(conv_ids))
        .order_by(StudyRoom.started_at.desc())
        .limit(50)
    )).scalars().all()

    # Filter out rooms the user has soft-deleted
    visible = []
    for room in all_rooms:
        is_creator = room.creator_id == user_id
        if is_creator and room.hidden_for_creator:
            continue
        if not is_creator and room.hidden_for_partner:
            continue
        visible.append(room)
    return visible


async def hide_room(
    session: AsyncSession,
    room_id: int,
    user_id: int,
) -> None:
    """Soft-delete a session from the requesting user's history.
    Hard-deletes the row when both participants have removed it."""
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    if room.creator_id == user_id:
        room.hidden_for_creator = True
    else:
        room.hidden_for_partner = True
    if room.hidden_for_creator and room.hidden_for_partner:
        await session.delete(room)
    await session.commit()


async def get_pending_invitations(
    session: AsyncSession,
    user_id: int,
) -> list[dict]:
    """Return all active rooms where this user is the partner (not creator) and hasn't joined yet.

    These are rooms created by someone else and sent as an invitation to this user.
    """
    # All conversations the user is part of
    convs = (await session.execute(
        select(Conversation).where(
            (Conversation.user_a_id == user_id) | (Conversation.user_b_id == user_id)
        )
    )).scalars().all()
    conv_ids = [c.id for c in convs]
    if not conv_ids:
        return []

    # Active rooms in those conversations where user is NOT the creator and hasn't joined
    rooms = (await session.execute(
        select(StudyRoom).where(
            StudyRoom.conversation_id.in_(conv_ids),
            StudyRoom.ended_at.is_(None),
            StudyRoom.creator_id != user_id,
            StudyRoom.partner_joined.is_(False),
        )
    )).scalars().all()

    # Build response with partner (creator) info
    output = []
    for room in rooms:
        conv = next((c for c in convs if c.id == room.conversation_id), None)
        if not conv:
            continue
        creator = (await session.execute(
            select(User).where(User.id == room.creator_id)
        )).scalar_one_or_none()
        if not creator:
            continue
        output.append({
            "roomId": room.id,
            "conversationId": room.conversation_id,
            "subject": room.subject,
            "goal": room.goal,
            "partner": {
                "id": creator.id,
                "displayName": creator.full_name or creator.email,
                "photoURL": creator.photo_url or "",
                "isOnline": creator.is_online,
            },
        })
    return output


async def decline_invitation(
    session: AsyncSession,
    room_id: int,
    user_id: int,
) -> None:
    """Decline a study room invitation by ending the room before it starts."""
    room = await _get_room_or_404(session, room_id)
    await _assert_participant(session, room, user_id)
    # Only the invited partner can decline (not the creator)
    if room.creator_id == user_id:
        raise HTTPException(status_code=403, detail="You cannot decline your own invitation.")
    if room.partner_joined:
        raise HTTPException(status_code=400, detail="Session already started.")
    if room.ended_at is not None:
        return  # Already ended — treat as success
    room.ended_at = _now()
    room.duration_minutes = 0
    await session.commit()
