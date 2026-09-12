"""User ORM model."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import ARRAY, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


_XP_LEVELS = [
    (1000, "Master"),
    (600, "Expert"),
    (300, "Scholar"),
    (100, "Explorer"),
    (0, "Beginner"),
]


def _xp_level(xp: int) -> dict:
    for threshold, name in _XP_LEVELS:
        if xp >= threshold:
            return {"name": name, "xp": xp, "threshold": threshold}
    return {"name": "Beginner", "xp": xp, "threshold": 0}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identity / auth ──
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Null for Google-only accounts (they authenticate through Firebase).
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Set for accounts created / linked via Google sign-in.
    firebase_uid: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True, nullable=True)
    provider: Mapped[str] = mapped_column(String(20), default="password", nullable=False)  # "password" | "google"

    # ── Role ──
    # "student" (default) | "admin"
    role: Mapped[str] = mapped_column(String(20), default="student", nullable=False)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 6-digit email verification code (stored hashed) + its expiry.
    verification_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    code_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # 6-digit password-reset code (stored hashed) + its expiry.
    reset_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reset_code_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Profile ──
    full_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    photo_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    grade: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    subjects_good_at: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    subjects_need_help: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    skill_level: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    language: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    bio: Mapped[str] = mapped_column(Text, default="", nullable=False)
    location: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rating: Mapped[float] = mapped_column(Integer, default=0, nullable=False)  # 0-5, stored as int (multiply by 10)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    session_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Streak tracking ──
    streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Privacy ──
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_direct_message: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Onboarding flags ──
    agreed_to_learning_agreement: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agreement_accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Timestamps ──
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # ── Back-references populated by curriculum models ──
    created_resources: Mapped[list] = relationship(
        "Resource", back_populates="creator", foreign_keys="Resource.created_by"
    )
    learning_sessions_as_creator: Mapped[list] = relationship(
        "LearningSession", back_populates="creator", foreign_keys="LearningSession.creator_id"
    )
    learning_sessions_as_partner: Mapped[list] = relationship(
        "LearningSession", back_populates="partner", foreign_keys="LearningSession.partner_id"
    )
    session_activity_results: Mapped[list] = relationship(
        "SessionActivityResult", back_populates="user", foreign_keys="SessionActivityResult.user_id"
    )
    topic_progress: Mapped[list] = relationship(
        "TopicProgress", back_populates="user"
    )
    resource_downloads: Mapped[list] = relationship(
        "ResourceDownload", back_populates="user"
    )

    def serialize(self) -> dict:
        """Shape returned to the frontend (matches the previous API contract)."""
        return {
            "uid": str(self.id),
            "email": self.email,
            "exists": True,
            "displayName": self.full_name,
            "grade": self.grade,
            "subjectsGoodAt": list(self.subjects_good_at or []),
            "subjectsNeedHelp": list(self.subjects_need_help or []),
            "skillLevel": self.skill_level,
            "language": self.language,
            "bio": self.bio,
            "photoURL": self.photo_url,
            "location": self.location,
            "isOnline": self.is_online,
            "rating": self.rating / 10.0 if self.rating else 0.0,  # Convert back to 0-5 scale
            "reviewCount": self.review_count,
            "sessionCount": self.session_count,
            "xp": self.xp or 0,
            "level": _xp_level(self.xp or 0),
            "streak": self.streak_days or 0,
            "isPublic": self.is_public,
            "allowDirectMessage": self.allow_direct_message,
            "emailVerified": self.email_verified,
            "agreedToLearningAgreement": self.agreed_to_learning_agreement,
            "profileComplete": self.profile_complete,
            "provider": self.provider,
            "hasPassword": bool(self.hashed_password),
            "role": self.role,
        }
