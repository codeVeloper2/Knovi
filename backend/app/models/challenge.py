"""AI Quiz Battle ORM models.

The challenge system is server-authoritative. Questions are immutable snapshots,
answers are single-use per participant/question, and results are frozen when the
battle completes or expires.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    text,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


CHALLENGE_STATUSES = {
    "created",
    "pending",
    "accepted",
    "preparing",
    "waiting",
    "countdown",
    "question_active",
    "waiting_for_opponent",
    "question_reveal",
    "next_question",
    "completed",
    "declined",
    "cancelled",
    "expired",
}

TERMINAL_CHALLENGE_STATUSES = {"completed", "declined", "cancelled", "expired"}


class ChallengeSession(Base):
    """A 1-v-1 AI-generated quiz battle bound to one shared curriculum concept."""

    __tablename__ = "challenge_sessions"
    __table_args__ = (
        CheckConstraint(
            "challenger_id <> opponent_id",
            name="ck_challenge_distinct_participants",
        ),
        CheckConstraint(
            "question_count BETWEEN 3 AND 10",
            name="ck_challenge_question_count",
        ),
        CheckConstraint(
            "current_question BETWEEN 0 AND 10",
            name="ck_challenge_current_question",
        ),
        CheckConstraint(
            "status IN ('created','pending','accepted','preparing','waiting','countdown',"
            "'question_active','waiting_for_opponent','question_reveal','next_question',"
            "'completed','declined','cancelled','expired')",
            name="ck_challenge_status",
        ),
        Index("idx_challenges_challenger", "challenger_id"),
        Index("idx_challenges_opponent", "opponent_id"),
        Index("idx_challenges_concept", "concept_id"),
        Index("idx_challenges_status", "status"),
        Index("idx_challenges_expires", "expires_at"),
        Index(
            "uq_challenge_active_pair_concept",
            text("LEAST(challenger_id, opponent_id)"),
            text("GREATEST(challenger_id, opponent_id)"),
            "concept_id",
            unique=True,
            postgresql_where=text(
                "status IN ('pending','accepted','preparing','waiting','countdown',"
                "'question_active','waiting_for_opponent','question_reveal','next_question')"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    challenger_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    opponent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    subject_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False
    )
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="RESTRICT"), nullable=False
    )
    concept_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("concepts.id", ondelete="RESTRICT"), nullable=False
    )

    # The exact AI learning sessions used to construct the battle.
    source_session_a_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("ai_learning_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_session_b_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("ai_learning_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")

    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    current_question: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    challenger_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    opponent_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    challenger_ready_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    opponent_ready_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    preparation_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    preparation_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    countdown_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_question_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_question_deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Used for lazy stale-battle expiration after a WebSocket disconnect.
    challenger_disconnected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    opponent_disconnected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Internal/audit metadata only. Never returned wholesale to either participant.
    challenge_metadata: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict
    )

    questions: Mapped[list["ChallengeQuestion"]] = relationship(
        "ChallengeQuestion",
        back_populates="challenge",
        cascade="all, delete-orphan",
        order_by="ChallengeQuestion.question_number",
    )
    answers: Mapped[list["ChallengeAnswer"]] = relationship(
        "ChallengeAnswer",
        back_populates="challenge",
        cascade="all, delete-orphan",
    )
    results: Mapped[list["ChallengeResult"]] = relationship(
        "ChallengeResult",
        back_populates="challenge",
        cascade="all, delete-orphan",
    )


class ChallengeQuestion(Base):
    """Immutable, validated question snapshot generated for one challenge."""

    __tablename__ = "challenge_questions"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "question_number",
            name="uq_challenge_question_number",
        ),
        UniqueConstraint(
            "challenge_id", "id",
            name="uq_challenge_question_session_id",
        ),
        Index("idx_challenge_questions_challenge", "challenge_id"),
        Index("idx_challenge_questions_objective", "objective_id"),
        CheckConstraint(
            "question_number BETWEEN 1 AND 10",
            name="ck_challenge_question_number",
        ),
        CheckConstraint(
            "correct_answer IN ('A','B','C','D')",
            name="ck_challenge_correct_answer",
        ),
        CheckConstraint(
            "difficulty IN ('easy','medium','hard')",
            name="ck_challenge_question_difficulty",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    challenge_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("challenge_sessions.id", ondelete="CASCADE"), nullable=False
    )
    question_number: Mapped[int] = mapped_column(Integer, nullable=False)

    objective_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("learning_objectives.id", ondelete="RESTRICT"),
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(1), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False)

    # Provider/model/version and validation metadata, not learner-facing.
    generation_metadata: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    challenge: Mapped["ChallengeSession"] = relationship(
        "ChallengeSession", back_populates="questions"
    )
    answers: Mapped[list["ChallengeAnswer"]] = relationship(
        "ChallengeAnswer", back_populates="question", cascade="all, delete-orphan"
    )


class ChallengeAnswer(Base):
    """One immutable answer submission per participant per question."""

    __tablename__ = "challenge_answers"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "question_id", "user_id",
            name="uq_challenge_answer_participant_question",
        ),
        ForeignKeyConstraint(
            ["challenge_id", "question_id"],
            ["challenge_questions.challenge_id", "challenge_questions.id"],
            ondelete="CASCADE",
            name="fk_challenge_answer_question_in_challenge",
        ),
        Index("idx_challenge_answers_challenge", "challenge_id"),
        Index("idx_challenge_answers_question", "question_id"),
        Index("idx_challenge_answers_user", "user_id"),
        CheckConstraint(
            "answer IS NULL OR answer IN ('A','B','C','D')",
            name="ck_challenge_answer_option",
        ),
        CheckConstraint(
            "response_time_ms IS NULL OR response_time_ms >= 0",
            name="ck_challenge_response_time_nonnegative",
        ),
        CheckConstraint(
            "(timed_out = TRUE AND answer IS NULL) OR (timed_out = FALSE AND answer IS NOT NULL)",
            name="ck_challenge_answer_timeout_consistency",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    challenge_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("challenge_sessions.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    answer: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timed_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    evaluation_metadata: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict
    )

    challenge: Mapped["ChallengeSession"] = relationship(
        "ChallengeSession", back_populates="answers"
    )
    question: Mapped["ChallengeQuestion"] = relationship(
        "ChallengeQuestion", back_populates="answers"
    )


class ChallengeResult(Base):
    """Frozen per-user final/expired challenge result."""

    __tablename__ = "challenge_results"
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_challenge_result_participant"),
        Index("idx_challenge_results_challenge", "challenge_id"),
        Index("idx_challenge_results_user", "user_id"),
        CheckConstraint(
            "score >= 0 AND score <= 10",
            name="ck_challenge_result_score",
        ),
        CheckConstraint(
            "accuracy >= 0 AND accuracy <= 100",
            name="ck_challenge_result_accuracy",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    challenge_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("challenge_sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accuracy: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weak_areas: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    performance: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    challenge: Mapped["ChallengeSession"] = relationship(
        "ChallengeSession", back_populates="results"
    )
