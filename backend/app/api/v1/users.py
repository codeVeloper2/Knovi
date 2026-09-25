"""User discovery routes.

Provides two discovery modes through GET /api/users/discover:

  section=learning_peers  (default when ?section= is supplied)
    Returns up to 20 students with a meaningful learning overlap to the current
    user, sorted by overlap score. Each result includes learningOverlap metadata,
    relationship state ("none" | "conversation"), and a challengeEligible hint.

  section=all  (or when section param is absent — backward-compatible)
    Returns all profile-complete students (except self) with optional filters,
    enriched with relationship and learningOverlap where present. Matches the
    previous API contract so existing frontend calls still work.

Architecture note
─────────────────
"Connected" in Knovi is defined as having a Conversation row — this is what
the challenge backend checks in _is_connected(). We follow the same definition
here. The [Connect] action in the frontend calls POST /api/chat/conversations,
which is already the existing mechanism for starting a peer chat.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.services.discover_service import (
    discover_learning_peers,
    enrich_discover_users,
)

router = APIRouter()


@router.get("/discover")
async def discover_users(
    # Backward-compatible filters (existing contract).
    level: Optional[str] = Query(None),
    availability: Optional[str] = Query(None, pattern="^(online|all)$"),
    sort: str = Query("recommended", pattern="^(recommended|top_rated|most_active|newest|learning_overlap)$"),
    # New section selector.
    section: Optional[str] = Query(None, pattern="^(learning_peers|all)$"),
    # New overlap-type filter (learning_peers section only).
    overlap_type: Optional[str] = Query(None, pattern="^(concept|topic|subject|all)$"),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Discover other students for chat, study sessions, or challenges.

    When section=learning_peers:
        Returns students with learning overlap (concept, topic, or subject),
        ranked deterministically from strongest to weakest. Results are
        enriched with learningOverlap, relationship, and challengeEligible.

    When section=all (or section is absent — backward-compatible):
        Returns all profile-complete users (except self) with optional
        level/availability/sort filters, enriched with relationship and
        learningOverlap where available. Matches the previous API contract.
    """
    # ── Learning peers section ─────────────────────────────────────────────
    if section == "learning_peers":
        candidates = await _fetch_candidates(
            user_id=user.id,
            level=level,
            availability=availability,
            session=session,
        )
        include_weak = overlap_type == "all"
        results = await discover_learning_peers(
            current_user_id=user.id,
            candidates=candidates,
            db=session,
            include_weak_overlap=include_weak,
        )
        # Optional filter by overlap type after scoring.
        if overlap_type and overlap_type != "all":
            results = [
                r for r in results
                if r.get("learningOverlap") and r["learningOverlap"]["type"] == overlap_type
            ]
        return results

    # ── General Discover (backward-compatible) ─────────────────────────────
    candidates = await _fetch_candidates(
        user_id=user.id,
        level=level,
        availability=availability,
        session=session,
    )

    # Sort candidates before enrichment (enrichment is stateless wrt order).
    if sort == "top_rated":
        candidates.sort(key=lambda u: (u.rating, u.review_count), reverse=True)
    elif sort == "most_active":
        candidates.sort(key=lambda u: u.session_count, reverse=True)
    elif sort == "newest":
        candidates.sort(key=lambda u: u.created_at, reverse=True)
    elif sort == "learning_overlap":
        # Will be re-sorted by overlap score after enrichment below.
        pass
    else:  # recommended (default)
        candidates.sort(
            key=lambda u: (u.is_online, u.rating, u.review_count), reverse=True
        )

    enriched = await enrich_discover_users(
        current_user_id=user.id,
        candidates=candidates,
        db=session,
    )

    if sort == "learning_overlap":
        enriched.sort(
            key=lambda r: (
                -(r["learningOverlap"]["score"] if r.get("learningOverlap") else 0),
                -(1 if r["learningOverlap"] and r["learningOverlap"]["isActive"] else 0),
                -(1 if r["isOnline"] else 0),
            )
        )

    return enriched


# ── Shared helpers ─────────────────────────────────────────────────────────────

async def _fetch_candidates(
    *,
    user_id: int,
    level: Optional[str],
    availability: Optional[str],
    session: AsyncSession,
) -> list[User]:
    """Fetch profile-complete users (not self) with optional level/availability filters."""
    query = select(User).where(
        and_(
            User.profile_complete.is_(True),
            User.is_public.is_(True),
            User.id != user_id,
        )
    )
    if level and level != "All Levels":
        query = query.where(User.grade == level)
    if availability == "online":
        query = query.where(User.is_online.is_(True))

    result = await session.execute(query)
    return list(result.scalars().all())
