"""Progress system ORM models: Badges and Certificates."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Badge Definitions (static catalogue) ──────────────────────────────────

BADGE_CATALOGUE = [
    {
        "id": "first_step",
        "name": "First Step",
        "emoji": "🎯",
        "desc": "Complete your first learning activity",
    },
    {
        "id": "study_buddy",
        "name": "Study Buddy",
        "emoji": "🤝",
        "desc": "Complete your first Study Room session",
    },
    {
        "id": "dedicated_learner",
        "name": "Dedicated Learner",
        "emoji": "⚡",
        "desc": "Complete 5 learning activities",
    },
    {
        "id": "streak_3",
        "name": "3-Day Scholar",
        "emoji": "🔥",
        "desc": "Maintain a 3-day learning streak",
    },
    {
        "id": "streak_7",
        "name": "7-Day Scholar",
        "emoji": "🏅",
        "desc": "Maintain a 7-day learning streak",
    },
    {
        "id": "knowledge_sharer",
        "name": "Knowledge Sharer",
        "emoji": "💡",
        "desc": "Help another student in 5 Study Room sessions",
    },
    {
        "id": "peer_mentor",
        "name": "Peer Mentor",
        "emoji": "🧑‍🏫",
        "desc": "Help another student in 10 Study Room sessions",
    },
    {
        "id": "growing_learner",
        "name": "Growing Learner",
        "emoji": "🌱",
        "desc": "Reach Level 5 (300 XP)",
    },
    {
        "id": "consistent_learner",
        "name": "Consistent Learner",
        "emoji": "🎓",
        "desc": "Reach Level 10 (1000 XP)",
    },
    {
        "id": "team_player",
        "name": "Team Player",
        "emoji": "👥",
        "desc": "Complete 10 collaborative Study Room sessions",
    },
]

BADGE_MAP = {b["id"]: b for b in BADGE_CATALOGUE}


# ── Earned Badge ───────────────────────────────────────────────────────────

class EarnedBadge(Base):
    """Records a badge that a user has unlocked."""
    __tablename__ = "earned_badges"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="uq_earned_badge_user_badge"),
    )

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:    Mapped[int]      = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    badge_id:   Mapped[str]      = mapped_column(String(60), nullable=False)
    earned_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    def serialize(self) -> dict:
        meta = BADGE_MAP.get(self.badge_id, {})
        return {
            "id": self.badge_id,
            "name": meta.get("name", self.badge_id),
            "emoji": meta.get("emoji", "🏆"),
            "desc": meta.get("desc", ""),
            "earned": True,
            "earnedAt": self.earned_at.isoformat(),
        }


# ── Certificate ────────────────────────────────────────────────────────────

class Certificate(Base):
    """Awarded when a student completes a certifiable course."""
    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_certificate_user_course"),
    )

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    cert_uid:      Mapped[str]           = mapped_column(String(40), unique=True, nullable=False)
    user_id:       Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id:     Mapped[int]           = mapped_column(
        Integer, ForeignKey("learn_courses.id", ondelete="CASCADE"), nullable=False
    )
    course_name:   Mapped[str]           = mapped_column(String(200), nullable=False)
    student_name:  Mapped[str]           = mapped_column(String(120), nullable=False)
    subject:       Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    issued_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "certUid": self.cert_uid,
            "userId": self.user_id,
            "courseId": self.course_id,
            "courseName": self.course_name,
            "studentName": self.student_name,
            "subject": self.subject or "",
            "issuedAt": self.issued_at.isoformat(),
        }
