"""AI Learning Profile ORM model.

Stores the student's self-reported learning preferences (set during onboarding /
Settings) and the AI-observed learning tendencies accumulated over real sessions.

One row per user — created lazily on first GET or PUT.  All JSONB columns
default to empty lists so the application never receives null for them.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AILearningProfile(Base):
    """
    ai_learning_profiles
    ────────────────────
    strengths            JSONB   list[str]  – subjects / skills the student is good at
    struggles            JSONB   list[str]  – areas the student finds difficult
    learning_preferences JSONB   list[str]  – how the student prefers to learn
    learning_behavior    JSONB   list[str]  – what helps when they are stuck
    personal_note        Text               – free-form note from the student
    ai_observations      JSONB   list[dict] – structured observations written by the AI
    """

    __tablename__ = "ai_learning_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # ── Student-reported fields ────────────────────────────────────────────
    # What the student says they are good at (subjects, skills, etc.)
    strengths: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # What the student says they find difficult
    struggles: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # How the student prefers to learn (selected from a menu + free text)
    learning_preferences: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # What usually helps the student when they are stuck
    learning_behavior: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Optional free-form note the student writes about themselves
    personal_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── AI-observed field ──────────────────────────────────────────────────
    # Each entry is a structured observation dict (see schema for shape).
    # The list grows over time; entries are never deleted, only appended.
    ai_observations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # ── Timestamps ────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    def serialize(self) -> dict:
        return {
            "userId": self.user_id,
            "strengths": list(self.strengths or []),
            "struggles": list(self.struggles or []),
            "learningPreferences": list(self.learning_preferences or []),
            "learningBehavior": list(self.learning_behavior or []),
            "personalNote": self.personal_note or "",
            "aiObservations": list(self.ai_observations or []),
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }
