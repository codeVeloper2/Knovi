"""User directory routes: discover endpoint for finding other students."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User

router = APIRouter()


@router.get("/discover")
async def discover_users(
    level: Optional[str] = Query(None),
    availability: Optional[str] = Query(None, pattern="^(online|all)$"),
    sort: str = Query("recommended", pattern="^(recommended|top_rated|most_active|newest)$"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Discover other students for chat, study sessions, or challenges.
    
    Returns all profile-complete users (except self) with optional filters.
    No subject-based matching or friend requests - users can directly message
    anyone whose privacy settings allow it.
    """
    # Base query: profile complete, not self
    query = select(User).where(
        and_(
            User.profile_complete.is_(True),
            User.id != user.id,
        )
    )
    
    # Level filter
    if level and level != "All Levels":
        query = query.where(User.grade == level)
    
    # Availability filter
    if availability == "online":
        query = query.where(User.is_online.is_(True))
    
    # Fetch all candidates
    result = await session.execute(query)
    users = list(result.scalars().all())
    
    # Sort
    if sort == "top_rated":
        users.sort(key=lambda u: (u.rating, u.review_count), reverse=True)
    elif sort == "most_active":
        users.sort(key=lambda u: u.session_count, reverse=True)
    elif sort == "newest":
        users.sort(key=lambda u: u.created_at, reverse=True)
    else:  # recommended (default): online first, then by rating
        users.sort(key=lambda u: (u.is_online, u.rating, u.review_count), reverse=True)
    
    return [u.serialize() for u in users]
