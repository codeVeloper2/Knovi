"""Solo Learning + Sync ORM models.

New tables that power the Complete Learning System:

  ConceptProgress  – per-user, per-concept solo learning state
  CheckpointAnswer – individual MCQ/short-answer attempt within a checkpoint
  ExplanationAttempt – "explain in your own words" + AI verdict
  SyncSession      – peer-sync session (equal peers, no teacher/learner)
  SyncPhaseEvent   – log of phase transitions + per-phase data in a sync
  SyncGap          – gap detected after a sync session
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
    Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# 1. CONCEPT PROGRESS
#    Tracks where a user is in the solo-learning flow for each concept.
# ─────────────────────────────────────────────────────────────────────────────

class ConceptProgress(Base):
    """Per-user, per-concept solo learning progress (legacy solo/sync system)."""
    __tablename__ = "solo_concept_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "concept_id", name="uq_solo_concept_progress_user_concept"),
        Index("idx_solo_concept_progress_user", "user_id"),
        Index("idx_solo_concept_progress_topic", "topic_id"),
    )

    id:         Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:    Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    topic_id:   Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    concept_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
    )

    # lesson | checkpoint | notes | ask_ai | passed
    stage: Mapped[str] = mapped_column(String(30), default="lesson", nullable=False)

    # Checkpoint: how many questions answered correctly out of total
    checkpoint_score:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checkpoint_total:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checkpoint_passed:  Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    checkpoint_passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Explanation / AI notes
    explanation_text:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    explanation_verdict:Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # correct | partial | incorrect
    explanation_score:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)      # 0-100
    explanation_feedback:Mapped[Optional[str]]= mapped_column(Text, nullable=True)

    # Sync eligibility
    sync_eligible:      Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    sync_completed:     Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)

    # "needs_review" if gap detected after sync
    needs_review:       Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)

    # XP awarded for this concept
    xp_awarded:         Mapped[int]           = mapped_column(Integer, default=0, nullable=False)

    lesson_viewed_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:         Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:         Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "topicId": self.topic_id,
            "conceptId": self.concept_id,
            "stage": self.stage,
            "checkpointScore": self.checkpoint_score,
            "checkpointTotal": self.checkpoint_total,
            "checkpointPassed": self.checkpoint_passed,
            "checkpointPassedAt": self.checkpoint_passed_at.isoformat() if self.checkpoint_passed_at else None,
            "explanationText": self.explanation_text,
            "explanationVerdict": self.explanation_verdict,
            "explanationScore": self.explanation_score,
            "explanationFeedback": self.explanation_feedback,
            "syncEligible": self.sync_eligible,
            "syncCompleted": self.sync_completed,
            "needsReview": self.needs_review,
            "xpAwarded": self.xp_awarded,
            "lessonViewedAt": self.lesson_viewed_at.isoformat() if self.lesson_viewed_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 2. CHECKPOINT ANSWER
#    One row per question attempt in the solo checkpoint.
# ─────────────────────────────────────────────────────────────────────────────

class CheckpointAnswer(Base):
    """Persisted answer for each checkpoint question attempt."""
    __tablename__ = "checkpoint_answers"
    __table_args__ = (
        Index("idx_checkpoint_answers_user_concept", "user_id", "concept_id"),
    )

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:        Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    concept_id:     Mapped[int]           = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
    )
    question_id:    Mapped[int]           = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    response:       Mapped[str]           = mapped_column(Text, nullable=False)
    is_correct:     Mapped[bool]          = mapped_column(Boolean, nullable=False)
    attempt_number: Mapped[int]           = mapped_column(Integer, default=1, nullable=False)
    answered_at:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "conceptId": self.concept_id,
            "questionId": self.question_id,
            "response": self.response,
            "isCorrect": self.is_correct,
            "attemptNumber": self.attempt_number,
            "answeredAt": self.answered_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. EXPLANATION ATTEMPT
#    "Explain in your own words" submissions + AI result.
# ─────────────────────────────────────────────────────────────────────────────

class ExplanationAttempt(Base):
    """One explanation submission per attempt."""
    __tablename__ = "explanation_attempts"
    __table_args__ = (
        Index("idx_explanation_attempts_user_concept", "user_id", "concept_id"),
    )

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:        Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    concept_id:     Mapped[int]           = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
    )
    topic_id:       Mapped[int]           = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    response:       Mapped[str]           = mapped_column(Text, nullable=False)
    attempt_number: Mapped[int]           = mapped_column(Integer, default=1, nullable=False)

    # AI result
    ai_verdict:     Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # correct | partial | incorrect
    ai_score:       Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_confidence:  Mapped[Optional[float]] = mapped_column(nullable=True)
    ai_feedback:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_correct_points:   Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    ai_missing_points:   Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    ai_incorrect_points: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    ai_misconceptions:   Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    ai_provider:    Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ai_error:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "conceptId": self.concept_id,
            "topicId": self.topic_id,
            "response": self.response,
            "attemptNumber": self.attempt_number,
            "aiVerdict": self.ai_verdict,
            "aiScore": self.ai_score,
            "aiConfidence": float(self.ai_confidence) if self.ai_confidence else None,
            "aiFeedback": self.ai_feedback,
            "aiCorrectPoints": self.ai_correct_points or [],
            "aiMissingPoints": self.ai_missing_points or [],
            "aiIncorrectPoints": self.ai_incorrect_points or [],
            "aiMisconceptions": self.ai_misconceptions or [],
            "aiProvider": self.ai_provider,
            "aiError": self.ai_error,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. SYNC SESSION
#    Equal-peer sync session. Replaces the old teacher/learner LearningSession
#    for this new workflow. Links back to a concept checkpoint.
# ─────────────────────────────────────────────────────────────────────────────

# Allowed workflow states for a SyncSession
_SYNC_STATES = (
    "LOBBY",        # waiting for partner
    "WARMUP",       # phase 1: quick checkpoint questions (0-2 min)
    "EXPLAIN",      # phase 2: each peer explains (2-7 min)
    "QUIZ",         # phase 3: peers quiz each other (7-12 min)
    "GAP_CHECK",    # phase 4: gap summary (12-15 min)
    "COMPLETED",    # finished
    "CANCELLED",    # cancelled before completion
)


class SyncSession(Base):
    """Equal-peer sync session for a specific concept checkpoint."""
    __tablename__ = "sync_sessions"
    __table_args__ = (
        CheckConstraint(
            "phase IN ('LOBBY','WARMUP','EXPLAIN','QUIZ','GAP_CHECK','COMPLETED','CANCELLED')",
            name="ck_sync_sessions_phase",
        ),
        Index("idx_sync_sessions_initiator", "initiator_id"),
        Index("idx_sync_sessions_partner",   "partner_id"),
        Index("idx_sync_sessions_concept",   "concept_id"),
        Index("idx_sync_sessions_topic",     "topic_id"),
        Index("idx_sync_sessions_phase",     "phase"),
    )

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    initiator_id: Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable until a partner joins
    partner_id:   Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    topic_id:     Mapped[int]           = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    concept_id:   Mapped[int]           = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
    )

    # Checkpoint context (for display in lobby / invite)
    checkpoint_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Session state
    phase: Mapped[str] = mapped_column(String(20), default="LOBBY", nullable=False)

    # Short join code e.g. "SYNC-4827"
    session_code: Mapped[Optional[str]] = mapped_column(String(12), unique=True, nullable=True, index=True)

    # Readiness flags
    initiator_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    partner_ready:   Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Explain phase: whose turn (initiator | partner | done)
    explain_turn: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    # initiator_understood | partner_understood flags after each explanation
    initiator_explained:    Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    partner_explained:      Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    initiator_understood:   Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    partner_understood:     Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # Session metadata
    started_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # AI gap-check summary (stored as JSON after phase 4)
    gap_summary: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    initiator: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[initiator_id], lazy="selectin"
    )
    partner: Mapped[Optional["User"]] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[partner_id], lazy="selectin"
    )
    warmup_answers: Mapped[list["SyncWarmupAnswer"]] = relationship(
        "SyncWarmupAnswer", back_populates="session", cascade="all, delete-orphan"
    )
    quiz_exchanges: Mapped[list["SyncQuizExchange"]] = relationship(
        "SyncQuizExchange", back_populates="session", cascade="all, delete-orphan"
    )
    gaps: Mapped[list["SyncGap"]] = relationship(
        "SyncGap", back_populates="session", cascade="all, delete-orphan"
    )

    def serialize(self, user_id: Optional[int] = None) -> dict:
        from app.services.chat_service import _serialize_partner  # avoid circular import
        return {
            "id": self.id,
            "initiatorId": self.initiator_id,
            "partnerId": self.partner_id,
            "topicId": self.topic_id,
            "conceptId": self.concept_id,
            "checkpointNumber": self.checkpoint_number,
            "phase": self.phase,
            "sessionCode": self.session_code,
            "initiatorReady": self.initiator_ready,
            "partnerReady": self.partner_ready,
            "explainTurn": self.explain_turn,
            "initiatorExplained": self.initiator_explained,
            "partnerExplained": self.partner_explained,
            "initiatorUnderstood": self.initiator_understood,
            "partnerUnderstood": self.partner_understood,
            "initiator": _serialize_partner(self.initiator) if self.initiator else None,
            "partner": _serialize_partner(self.partner) if self.partner else None,
            "gapSummary": self.gap_summary,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
            # Convenience: current user's role
            "myRole": (
                "initiator" if user_id == self.initiator_id
                else "partner" if user_id == self.partner_id
                else None
            ),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 5. SYNC WARMUP ANSWER
#    Quick checkpoint questions at the start of a sync session.
# ─────────────────────────────────────────────────────────────────────────────

class SyncWarmupAnswer(Base):
    """Warmup question answer submitted during sync phase 1."""
    __tablename__ = "sync_warmup_answers"
    __table_args__ = (
        UniqueConstraint("session_id", "user_id", "question_id", name="uq_sync_warmup_answer"),
    )

    id:          Mapped[int]  = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:  Mapped[int]  = mapped_column(
        Integer, ForeignKey("sync_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id:     Mapped[int]  = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int]  = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    response:    Mapped[str]  = mapped_column(Text, nullable=False)
    is_correct:  Mapped[bool] = mapped_column(Boolean, nullable=False)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    session: Mapped["SyncSession"] = relationship("SyncSession", back_populates="warmup_answers")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "questionId": self.question_id,
            "response": self.response,
            "isCorrect": self.is_correct,
            "answeredAt": self.answered_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 6. SYNC QUIZ EXCHANGE
#    One question asked + answer given during quiz phase.
# ─────────────────────────────────────────────────────────────────────────────

class SyncQuizExchange(Base):
    """Question + answer exchange during sync quiz phase."""
    __tablename__ = "sync_quiz_exchanges"
    __table_args__ = (
        Index("idx_sync_quiz_exchanges_session", "session_id"),
    )

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:  Mapped[int]           = mapped_column(
        Integer, ForeignKey("sync_sessions.id", ondelete="CASCADE"), nullable=False
    )
    asker_id:    Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    answerer_id: Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Optional: references a curriculum question
    question_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="SET NULL"), nullable=True
    )
    question_text: Mapped[str]         = mapped_column(Text, nullable=False)
    answer_text:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_correct:    Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    created_at:    Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    session: Mapped["SyncSession"] = relationship("SyncSession", back_populates="quiz_exchanges")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "askerId": self.asker_id,
            "answererId": self.answerer_id,
            "questionId": self.question_id,
            "questionText": self.question_text,
            "answerText": self.answer_text,
            "isCorrect": self.is_correct,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 7. SYNC GAP
#    A gap detected for one user after the sync session.
# ─────────────────────────────────────────────────────────────────────────────

class SyncGap(Base):
    """Gap/weakness detected for one participant after a sync session."""
    __tablename__ = "sync_gaps"
    __table_args__ = (
        Index("idx_sync_gaps_session", "session_id"),
        Index("idx_sync_gaps_user", "user_id"),
    )

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:  Mapped[int]           = mapped_column(
        Integer, ForeignKey("sync_sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id:     Mapped[int]           = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    concept_id:  Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True
    )
    gap_type:    Mapped[str]           = mapped_column(String(30), nullable=False)  # shaky | incorrect | missing | unclear
    description: Mapped[str]           = mapped_column(Text, nullable=False)
    reviewed:    Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    session: Mapped["SyncSession"] = relationship("SyncSession", back_populates="gaps")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "conceptId": self.concept_id,
            "gapType": self.gap_type,
            "description": self.description,
            "reviewed": self.reviewed,
            "createdAt": self.created_at.isoformat(),
        }
