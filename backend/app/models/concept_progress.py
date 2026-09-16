"""ConceptProgress ORM model for tracking sequential learning stages."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Learning stages (sequential pipeline)
LEARNING_STAGES = {
    "lesson",           # AI-generated lesson
    "checkpoint",       # Questions testing the lesson
    "explain",          # Student explains in their own words
    "ai_verification",  # AI evaluates explanation
    "ask_ai",           # Student can ask questions
    "challenge",        # Peer verification session
    "verified",         # Concept fully mastered
}


class ConceptProgress(Base):
    """
    Tracks a student's sequential learning progress for a specific concept.
    
    Flow: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified
    """
    __tablename__ = "concept_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "concept_id", name="uq_concept_progress_user_concept"),
    )

    id:                    Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:               Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    concept_id:            Mapped[int]           = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    # Current stage in the learning pipeline
    current_stage:         Mapped[str]           = mapped_column(String(40), default="lesson", nullable=False)
    
    # AI-generated lesson content (saved for checkpoint generation)
    lesson_content:        Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    lesson_completed:      Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    lesson_completed_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Checkpoint attempts (array of {questions, answers, score, passed, timestamp})
    checkpoint_attempts:   Mapped[list]          = mapped_column(JSONB, default=list, nullable=False)
    checkpoint_passed:     Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    checkpoint_passed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Reteaching content after failed checkpoint
    reteaching_content:    Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reteaching_count:      Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    
    # Explain It attempts (array of {explanation, ai_result, timestamp})
    explanation_attempts:  Mapped[list]          = mapped_column(JSONB, default=list, nullable=False)
    explanation_passed:    Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    explanation_passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # AI Verification result (latest)
    ai_verification_result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ai_verification_passed: Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    ai_verification_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Ask AI Q&A history
    ask_ai_questions:      Mapped[list]          = mapped_column(JSONB, default=list, nullable=False)
    
    # Challenge eligibility and completion
    challenge_eligible:    Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    challenge_session_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    challenge_passed:      Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    challenge_passed_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Final verification (concept mastered)
    verified:              Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    verified_at:           Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at:            Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:            Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    user:    Mapped["User"]    = relationship("app.models.user.User", back_populates="concept_progress")  # type: ignore[name-defined]
    concept: Mapped["Concept"] = relationship("Concept")  # type: ignore[name-defined]

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "conceptId": self.concept_id,
            "currentStage": self.current_stage,
            "lessonContent": self.lesson_content,
            "lessonCompleted": self.lesson_completed,
            "lessonCompletedAt": self.lesson_completed_at.isoformat() if self.lesson_completed_at else None,
            "checkpointAttempts": self.checkpoint_attempts or [],
            "checkpointPassed": self.checkpoint_passed,
            "checkpointPassedAt": self.checkpoint_passed_at.isoformat() if self.checkpoint_passed_at else None,
            "reteachingContent": self.reteaching_content,
            "reteachingCount": self.reteaching_count,
            "explanationAttempts": self.explanation_attempts or [],
            "explanationPassed": self.explanation_passed,
            "explanationPassedAt": self.explanation_passed_at.isoformat() if self.explanation_passed_at else None,
            "aiVerificationResult": self.ai_verification_result,
            "aiVerificationPassed": self.ai_verification_passed,
            "aiVerificationAt": self.ai_verification_at.isoformat() if self.ai_verification_at else None,
            "askAiQuestions": self.ask_ai_questions or [],
            "challengeEligible": self.challenge_eligible,
            "challengeSessionId": self.challenge_session_id,
            "challengePassed": self.challenge_passed,
            "challengePassedAt": self.challenge_passed_at.isoformat() if self.challenge_passed_at else None,
            "verified": self.verified,
            "verifiedAt": self.verified_at.isoformat() if self.verified_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }
    
    def get_locked_stages(self) -> list[str]:
        """Return list of stages that are locked for this user."""
        if self.verified:
            return []

        stage_order = ["lesson", "checkpoint", "explain", "ai_verification", "ask_ai", "challenge", "verified"]
        current_idx = stage_order.index(self.current_stage) if self.current_stage in stage_order else 0
        locked = stage_order[current_idx + 1:]

        # Challenge unlocks as soon as challenge_eligible=True (even while at ask_ai)
        if self.challenge_eligible and "challenge" in locked:
            locked = [s for s in locked if s != "challenge"]

        return locked

    def can_access_stage(self, stage: str) -> bool:
        """Check if user can access the given stage."""
        if self.verified:
            return True
        # Challenge has its own eligibility flag independent of current_stage
        if stage == "challenge":
            return self.challenge_eligible
        return stage not in self.get_locked_stages()

    def advance_to_stage(self, stage: str) -> None:
        """Advance to the next stage."""
        self.current_stage = stage
        self.updated_at = _now()
