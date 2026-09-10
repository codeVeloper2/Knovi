"""User directory routes: discover endpoint for finding study partners."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.match import MatchRequest
from app.models.user import User

router = APIRouter()


@router.get("/discover")
async def discover_users(
    mode: str = Query("learn", pattern="^(learn|teach)$"),
    subject: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    availability: Optional[str] = Query(None, pattern="^(online|all)$"),
    sort: str = Query("recommended", pattern="^(recommended|top_rated|most_active|newest)$"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Discover potential study partners based on subject overlap.
    
    Mode logic:
    - learn: Find users where their subjectsGoodAt ∩ currentUser.subjectsNeedHelp
    - teach: Find users where their subjectsNeedHelp ∩ currentUser.subjectsGoodAt
    
    Excludes users with accepted or pending match requests (already connected or in-flight).
    
    Returns users with matching subjects, filtered and sorted.
    """
    # Get all user IDs with accepted OR pending match requests (both directions)
    existing_matches = (await session.execute(
        select(MatchRequest).where(
            and_(
                or_(
                    MatchRequest.sender_id == user.id,
                    MatchRequest.receiver_id == user.id,
                ),
                MatchRequest.status.in_(["accepted", "pending"]),
            )
        )
    )).scalars().all()
    
    # Build set of user IDs to exclude:
    # - accepted → already friends, never show again
    # - pending  → request already sent/received, don't show until resolved
    excluded_ids = {user.id}  # Always exclude self
    for match in existing_matches:
        if match.sender_id == user.id:
            excluded_ids.add(match.receiver_id)
        else:
            excluded_ids.add(match.sender_id)
    
    
    # Base query: profile complete, not self, not already matched
    query = select(User).where(
        and_(
            User.profile_complete.is_(True),
            User.id.notin_(excluded_ids),
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
    users = result.scalars().all()
    
    # Subject overlap filtering (must happen in Python for ARRAY intersection)
    my_good_at = set(user.subjects_good_at or [])
    my_need_help = set(user.subjects_need_help or [])
    
    filtered = []
    for u in users:
        their_good_at = set(u.subjects_good_at or [])
        their_need_help = set(u.subjects_need_help or [])
        
        if mode == "learn":
            # Show users who can teach me (their good_at ∩ my need_help)
            overlap = their_good_at & my_need_help
        else:  # teach
            # Show users I can teach (their need_help ∩ my good_at)
            overlap = their_need_help & my_good_at
        
        if not overlap:
            continue
        
        # Subject filter (if specified, must be in the overlap)
        if subject and subject != "All Subjects" and subject not in overlap:
            continue
        
        filtered.append(u)
    
    # Sort
    if sort == "top_rated":
        filtered.sort(key=lambda u: (u.rating, u.review_count), reverse=True)
    elif sort == "most_active":
        filtered.sort(key=lambda u: u.session_count, reverse=True)
    elif sort == "newest":
        filtered.sort(key=lambda u: u.created_at, reverse=True)
    else:  # recommended (default): online first, then by rating
        filtered.sort(key=lambda u: (u.is_online, u.rating, u.review_count), reverse=True)
    
    return [u.serialize() for u in filtered]
