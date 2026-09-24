"""AI Learning Session ORM models for PeerUP.

Tables (in creation / dependency order):
  ai_learning_sessions          — one session per student per concept visit
  ai_session_messages           — chat-like turn history (AI + student)
  ai_session_teaching           — persisted teaching content snapshot
  ai_session_study_periods      — study/reading timer records
  ai_session_questions          — AI-generated retrieval questions
  ai_session_answers            — student answers to retrieval questions
  ai_session_teaching_attempts  — adaptive reteaching records
  ai_session_integrity_events   — browser-level integrity signals
  ai_session_summaries          — end-of-session summary
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Session status constants ──────────────────────────────────────────────
SESSION_STATUSES = {
    "created",
    "teaching",
    "studying",
    "retrieval",
    "reteaching",
    "practice",
    "completed",
    "paused",
    "abandoned",
}

# ── Familiarity constants ─────────────────────────────────────────────────
FAMILIARITY_OPTIONS = {
    "new",            # Completely new
    "seen_before",    # Seen it before
    "know_basics",    # Understand the basics
    "know_well",      # Know it well
    "need_help",      # I need help with something specific
}

# ── Intent constants ──────────────────────────────────────────────────────
INTENT_OPTIONS = {
    "teach_me",
    "already_know",
    "explain_simply",
    "give_examples",
    "broaden",
    "go_deeper",
    "quiz_me",
    "custom",
}

# ── Message roles ─────────────────────────────────────────────────────────
MESSAGE_ROLES = {"ai", "student", "system"}

# ── Message types ─────────────────────────────────────────────────────────
MESSAGE_TYPES = {
    "teaching",
    "question",
    "answer",
    "feedback",
    "summary",
    "system",
    "welcome",
    "timer_start",
    "timer_end",
    "reteach",
    "practice",
    "idle_nudge",
}

# ── Teaching strategies ───────────────────────────────────────────────────
TEACHING_STRATEGIES = {
    "technical_explanation",
    "simple_explanation",
    "analogy",
    "real_world_example",
    "visual_description",
    "step_by_step",
    "worked_example",
    "comparison",
    "misconception_correction",
    "story_context",
    "socratic_questioning",
}

# ── Question types ────────────────────────────────────────────────────────
AI_QUESTION_TYPES = {
    "short_answer",
    "multiple_choice",
    "calculation",
    "explanation",
    "true_false",
    "application",
}

# ── Integrity event types ─────────────────────────────────────────────────
INTEGRITY_EVENT_TYPES = {
    "TAB_HIDDEN",
    "TAB_VISIBLE",
    "WINDOW_BLUR",
    "WINDOW_FOCUS",
    "FULLSCREEN_ENTER",
    "FULLSCREEN_EXIT",
    "SESSION_START",
    "TIMER_START",
    "TIMER_END",
}


# ─────────────────────────────────────────────────────────────────────────────
# 1. AI LEARNING SESSION
# ─────────────────────────────────────────────────────────────────────────────

class AILearningSession(Base):
    __tablename__ = "ai_learning_sessions"
    __table_args__ = (
        Index("idx_ai_sessions_user",    "user_id"),
        Index("idx_ai_sessions_concept", "concept_id"),
        Index("idx_ai_sessions_status",  "status"),
    )

    id:                  Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:             Mapped[int]           = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    topic_id:            Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    concept_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)

    # Student context (session-scoped, not a permanent profile attribute)
    student_familiarity: Mapped[str]           = mapped_column(String(40), nullable=False, default="new")
    student_note:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # custom knowledge note
    intent:              Mapped[str]           = mapped_column(String(40), nullable=False, default="teach_me")
    custom_intent_text:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # when intent == "custom"

    # Lifecycle
    status:              Mapped[str]           = mapped_column(String(20), nullable=False, default="created", index=True)
    started_at:          Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    messages:            Mapped[list["AISessionMessage"]]          = relationship("AISessionMessage",         back_populates="session", cascade="all, delete-orphan", order_by="AISessionMessage.sequence")
    teaching:            Mapped[list["AISessionTeaching"]]         = relationship("AISessionTeaching",        back_populates="session", cascade="all, delete-orphan")
    study_periods:       Mapped[list["AISessionStudyPeriod"]]      = relationship("AISessionStudyPeriod",     back_populates="session", cascade="all, delete-orphan")
    questions:           Mapped[list["AISessionQuestion"]]         = relationship("AISessionQuestion",        back_populates="session", cascade="all, delete-orphan")
    teaching_attempts:   Mapped[list["AISessionTeachingAttempt"]]  = relationship("AISessionTeachingAttempt", back_populates="session", cascade="all, delete-orphan")
    integrity_events:    Mapped[list["AISessionIntegrityEvent"]]   = relationship("AISessionIntegrityEvent",  back_populates="session", cascade="all, delete-orphan")
    summary:             Mapped[Optional["AISessionSummary"]]      = relationship("AISessionSummary",         back_populates="session", cascade="all, delete-orphan", uselist=False)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "subjectId": self.subject_id,
            "topicId": self.topic_id,
            "conceptId": self.concept_id,
            "studentFamiliarity": self.student_familiarity,
            "studentNote": self.student_note,
            "intent": self.intent,
            "customIntentText": self.custom_intent_text,
            "status": self.status,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 2. SESSION MESSAGES (chat turns)
# ─────────────────────────────────────────────────────────────────────────────

class AISessionMessage(Base):
    __tablename__ = "ai_session_messages"
    __table_args__ = (
        Index("idx_ai_messages_session", "session_id"),
    )

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:   Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    role:         Mapped[str]           = mapped_column(String(20), nullable=False)   # ai | student | system
    message_type: Mapped[str]           = mapped_column(String(30), nullable=False, default="teaching")
    content:      Mapped[str]           = mapped_column(Text, nullable=False)
    sequence:     Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
    extra:        Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)         # arbitrary metadata
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationship
    session: Mapped["AILearningSession"] = relationship("AILearningSession", back_populates="messages")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "role": self.role,
            "messageType": self.message_type,
            "content": self.content,
            "sequence": self.sequence,
            "extra": self.extra,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. TEACHING CONTENT SNAPSHOT
# ─────────────────────────────────────────────────────────────────────────────

class AISessionTeaching(Base):
    """Persists the actual teaching material generated for this session.
    Grounding retrieval questions in what was actually taught."""
    __tablename__ = "ai_session_teaching"
    __table_args__ = (
        Index("idx_ai_teaching_session", "session_id"),
    )

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:      Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    strategy:        Mapped[str]           = mapped_column(String(60), nullable=False, default="technical_explanation")
    attempt_number:  Mapped[int]           = mapped_column(Integer, nullable=False, default=1)

    # The structured teaching content
    explanation:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_points:      Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    examples:        Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    formulas:        Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    analogies:       Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    worked_examples: Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    misconceptions:  Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    # Curriculum objective IDs actually addressed by this teaching snapshot.
    # Kept separate from the AI learning plan so challenge generation can
    # distinguish planned topics from material that was actually taught.
    objective_ids:   Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    summary:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_content:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # full AI response text

    is_current:      Mapped[bool]          = mapped_column(Boolean, default=True, nullable=False)  # only the active one
    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationship
    session: Mapped["AILearningSession"] = relationship("AILearningSession", back_populates="teaching")

    def serialize(self) -> dict:
        learning_plan = []
        try:
            parsed = json.loads(self.raw_content or "{}")
            learning_plan = parsed.get("learning_tasks") or []
        except Exception:
            learning_plan = []
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "strategy": self.strategy,
            "attemptNumber": self.attempt_number,
            "explanation": self.explanation,
            "keyPoints": self.key_points or [],
            "examples": self.examples or [],
            "formulas": self.formulas or [],
            "analogies": self.analogies or [],
            "workedExamples": self.worked_examples or [],
            "misconceptions": self.misconceptions or [],
            "objectiveIds": [int(x) for x in (self.objective_ids or []) if str(x).isdigit()],
            "summary": self.summary,
            "learningPlan": learning_plan,
            "rawContent": self.raw_content,
            "isCurrent": self.is_current,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. STUDY / READING TIMER
# ─────────────────────────────────────────────────────────────────────────────

class AISessionStudyPeriod(Base):
    __tablename__ = "ai_session_study_periods"
    __table_args__ = (
        Index("idx_ai_study_session", "session_id"),
    )

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:       Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    duration_seconds: Mapped[int]           = mapped_column(Integer, nullable=False, default=300)  # allocated time
    started_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    expected_end_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at:         Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # active | completed | interrupted
    timer_status:     Mapped[str]           = mapped_column(String(20), nullable=False, default="active")
    created_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationship
    session: Mapped["AILearningSession"] = relationship("AILearningSession", back_populates="study_periods")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "durationSeconds": self.duration_seconds,
            "startedAt": self.started_at.isoformat(),
            "expectedEndAt": self.expected_end_at.isoformat() if self.expected_end_at else None,
            "endedAt": self.ended_at.isoformat() if self.ended_at else None,
            "timerStatus": self.timer_status,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 5. RETRIEVAL QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

class AISessionQuestion(Base):
    __tablename__ = "ai_session_questions"
    __table_args__ = (
        Index("idx_ai_questions_session", "session_id"),
        # Required so ai_session_answers can use a composite FK (session_id, question_id)
        # → (session_id, id) to guarantee cross-session integrity.
        UniqueConstraint("session_id", "id", name="uq_ai_questions_session_id"),
    )

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    question:       Mapped[str]           = mapped_column(Text, nullable=False)
    question_type:  Mapped[str]           = mapped_column(String(30), nullable=False, default="short_answer")
    # For multiple_choice: [{"label": "A", "text": "..."}]
    options:        Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    expected_answer:Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rubric:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # marking guide for AI
    hint:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # learner hint; must not reveal the answer
    stage:          Mapped[str]           = mapped_column(String(30), nullable=False, default="independent_practice")
    skill:          Mapped[str]           = mapped_column(String(30), nullable=False, default="application")
    sequence:       Mapped[int]           = mapped_column(Integer, nullable=False, default=1)
    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationships
    session: Mapped["AILearningSession"]    = relationship("AILearningSession", back_populates="questions")
    answers: Mapped[list["AISessionAnswer"]]= relationship("AISessionAnswer", back_populates="question", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "question": self.question,
            "questionType": self.question_type,
            "options": self.options,
            "hint": self.hint,
            "stage": self.stage,
            "skill": self.skill,
            "sequence": self.sequence,
            "createdAt": self.created_at.isoformat(),
            # NOTE: expected_answer and rubric are NOT returned to the student
        }

    def serialize_full(self) -> dict:
        """Include expected answer — for AI evaluation only, never sent to frontend."""
        d = self.serialize()
        d["expectedAnswer"] = self.expected_answer
        d["rubric"] = self.rubric
        return d


# ─────────────────────────────────────────────────────────────────────────────
# 6. STUDENT ANSWERS
# ─────────────────────────────────────────────────────────────────────────────

class AISessionAnswer(Base):
    __tablename__ = "ai_session_answers"
    __table_args__ = (
        Index("idx_ai_answers_session",  "session_id"),
        Index("idx_ai_answers_question", "question_id"),
        # Composite FK mirrors the DB constraint fk_answer_question_in_session:
        # ensures question_id belongs to the same session as session_id.
        # SQLAlchemy doesn't enforce composite FKs via __table_args__ at ORM level,
        # but the DB-level constraint in the migration handles it. We declare the
        # simple FKs on the columns for ORM relationship resolution.
    )

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:      Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("ai_session_questions.id", ondelete="CASCADE"), nullable=False)
    student_answer:  Mapped[str]           = mapped_column(Text, nullable=False)
    attempt_number:  Mapped[int]           = mapped_column(Integer, nullable=False, default=1)

    # AI evaluation results
    is_correct:      Mapped[Optional[bool]]= mapped_column(Boolean, nullable=True)
    score:           Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100
    feedback:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_evaluation:   Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)    # full structured eval

    # Timing
    response_time_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationships
    session:  Mapped["AILearningSession"] = relationship("AILearningSession")
    question: Mapped["AISessionQuestion"] = relationship("AISessionQuestion", back_populates="answers")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "questionId": self.question_id,
            "studentAnswer": self.student_answer,
            "attemptNumber": self.attempt_number,
            "isCorrect": self.is_correct,
            "score": self.score,
            "feedback": self.feedback,
            "responseTimeSeconds": self.response_time_seconds,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 7. ADAPTIVE TEACHING ATTEMPTS
# ─────────────────────────────────────────────────────────────────────────────

class AISessionTeachingAttempt(Base):
    __tablename__ = "ai_session_teaching_attempts"
    __table_args__ = (
        Index("idx_ai_attempts_session",  "session_id"),
        Index("idx_ai_attempts_snapshot", "teaching_snapshot_id"),
    )

    id:                  Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    attempt_number:      Mapped[int]           = mapped_column(Integer, nullable=False, default=1)
    strategy:            Mapped[str]           = mapped_column(String(60), nullable=False)
    reason:              Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # FK to the teaching snapshot produced by this attempt; SET NULL so deleting
    # a snapshot does not cascade-delete the attempt history log.
    teaching_snapshot_id:Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("ai_session_teaching.id", ondelete="SET NULL"), nullable=True
    )
    # outcome: improved | still_struggling | gave_up | completed
    outcome:             Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationships
    session:          Mapped["AILearningSession"]       = relationship("AILearningSession", back_populates="teaching_attempts")
    teaching_snapshot:Mapped[Optional["AISessionTeaching"]] = relationship("AISessionTeaching", foreign_keys=[teaching_snapshot_id])

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "attemptNumber": self.attempt_number,
            "strategy": self.strategy,
            "reason": self.reason,
            "teachingSnapshotId": self.teaching_snapshot_id,
            "outcome": self.outcome,
            "createdAt": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 8. SESSION INTEGRITY EVENTS
# ─────────────────────────────────────────────────────────────────────────────

class AISessionIntegrityEvent(Base):
    __tablename__ = "ai_session_integrity_events"
    __table_args__ = (
        Index("idx_ai_integrity_session", "session_id"),
    )

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:  Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False)
    event_type:  Mapped[str]           = mapped_column(String(40), nullable=False)
    occurred_at: Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    meta:        Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)

    # Relationship
    session: Mapped["AILearningSession"] = relationship("AILearningSession", back_populates="integrity_events")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "eventType": self.event_type,
            "occurredAt": self.occurred_at.isoformat(),
            "meta": self.meta,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 9. SESSION SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

class AISessionSummary(Base):
    __tablename__ = "ai_session_summaries"
    __table_args__ = (
        UniqueConstraint("session_id", name="uq_ai_summary_session"),
    )

    id:                  Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("ai_learning_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)

    summary_text:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_ideas:           Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    strengths:           Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    areas_for_practice:  Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    recommended_next:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    teaching_methods_used: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Performance snapshot
    questions_answered:  Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    questions_correct:   Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    reteach_count:       Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    overall_score:       Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100

    created_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationship
    session: Mapped["AILearningSession"] = relationship("AILearningSession", back_populates="summary")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "summaryText": self.summary_text,
            "keyIdeas": self.key_ideas or [],
            "strengths": self.strengths or [],
            "areasForPractice": self.areas_for_practice or [],
            "recommendedNext": self.recommended_next,
            "teachingMethodsUsed": self.teaching_methods_used or [],
            "questionsAnswered": self.questions_answered,
            "questionsCorrect": self.questions_correct,
            "reteachCount": self.reteach_count,
            "overallScore": self.overall_score,
            "createdAt": self.created_at.isoformat(),
        }
