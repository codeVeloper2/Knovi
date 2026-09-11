"""Progress routes — /api/progress, /api/progress/badges, /api/progress/certificates"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.services import progress_service

router = APIRouter()


@router.get("/progress")
async def get_progress(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the full consolidated progress object for the authenticated user."""
    return await progress_service.get_progress(session, user.id)


@router.get("/progress/badges")
async def get_badges(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Return all badges (earned + locked) for the authenticated user."""
    data = await progress_service.get_progress(session, user.id)
    return data.get("allBadges", [])


@router.get("/progress/certificates")
async def get_certificates(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    """Return all earned certificates for the authenticated user."""
    data = await progress_service.get_progress(session, user.id)
    return data.get("certificates", [])
