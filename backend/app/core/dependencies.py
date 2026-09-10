"""Shared FastAPI dependencies re-exported from a single place."""
from __future__ import annotations

from app.core.database import get_session
from app.core.security import current_user

__all__ = ["current_user", "get_session"]
