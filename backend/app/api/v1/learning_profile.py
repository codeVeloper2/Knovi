"""Learning Profile API routes — PeerUP.

GET  /api/learning/profile   — return the current user's learning profile
PUT  /api/learning/profile   — create or update student-reported fields

Students can only access their own profile.
AI observations are never writable via these endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.schemas.learning_profile import LearningProfileOut, LearningProfileUpdate
from app.services import learning_profile_service as svc

router = APIRouter()


@router.get("/learning/profile", response_model=LearningProfileOut)
async def get_learning_profile(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Return the authenticated student's AI learning profile.

    Creates an empty profile row lazily if this is the first access
    (e.g. for existing users who predate the feature).
    """
    profile = await svc.get_profile(user.id, db)
    return profile.serialize()


@router.put("/learning/profile", response_model=LearningProfileOut)
async def update_learning_profile(
    body: LearningProfileUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Create or update the student-reported learning profile fields.

    Accepts strengths, struggles, learning_preferences, learning_behavior,
    and personal_note.  The ai_observations field is managed server-side
    only and is never overwritten by this endpoint.
    """
    profile = await svc.upsert_profile(
        user_id=user.id,
        strengths=body.strengths,
        struggles=body.struggles,
        learning_preferences=body.learning_preferences,
        learning_behavior=body.learning_behavior,
        personal_note=body.personal_note,
        db=db,
    )
    return profile.serialize()
