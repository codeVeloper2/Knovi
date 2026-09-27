"""Email notifications gated by per-user preferences."""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import email_service

logger = logging.getLogger(__name__)

PREF_COLUMNS = {
    "messages": "notify_messages",
    "sessions": "notify_sessions",
    "progress": "notify_progress",
    "emails": "notify_emails",
}

_ENSURED = False


async def ensure_pref_columns(session: AsyncSession) -> None:
    """Best-effort add preference columns on Postgres (idempotent)."""
    global _ENSURED
    if _ENSURED:
        return
    try:
        for col in PREF_COLUMNS.values():
            await session.execute(
                text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} boolean DEFAULT true NOT NULL")
            )
        await session.commit()
        _ENSURED = True
    except Exception as exc:
        logger.warning("ensure_pref_columns failed (non-fatal): %s", exc)
        try:
            await session.rollback()
        except Exception:
            pass


def prefs_dict(user: User) -> dict:
    return {
        "messages": bool(getattr(user, "notify_messages", True)),
        "sessions": bool(getattr(user, "notify_sessions", True)),
        "progress": bool(getattr(user, "notify_progress", True)),
        "emails": bool(getattr(user, "notify_emails", True)),
    }


def pref_enabled(user: User, category: str) -> bool:
    col = PREF_COLUMNS.get(category)
    if not col:
        return True
    return bool(getattr(user, col, True))


async def email_user(
    session: AsyncSession,
    user_id: int,
    category: str,
    title: str,
    body: str,
    *,
    cta_label: str = "Open Knovi",
    cta_url: str = "",
) -> bool:
    """Send an email if SMTP is configured, user has email, and the category pref is on.

    Never raises — notification failures must not break the main action.
    """
    try:
        if not email_service.smtp_configured():
            return False
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or not user.email:
            return False
        if not pref_enabled(user, category):
            return False
        subject, html, text = email_service.notification_email(title, body, cta_label, cta_url)
        email_service.send_email(user.email, subject, html, text)
        return True
    except Exception as exc:
        logger.warning("email_user failed user_id=%s category=%s: %s", user_id, category, exc)
        return False
