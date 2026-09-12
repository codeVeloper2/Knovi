"""Shared FastAPI dependencies re-exported from a single place."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User


async def admin_user(user: User = Depends(current_user)) -> User:
    """Dependency that requires the authenticated user to have role='admin'.

    Any non-admin (including unauthenticated) request receives a 403.
    This is enforced at the backend level — hiding the UI is not sufficient.
    """
    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required.",
        )
    return user


__all__ = ["current_user", "get_session", "admin_user"]
