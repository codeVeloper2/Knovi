"""Curriculum ORM models for PeerUP's guided Learning Session system.

Tables (in creation / dependency order):
  subjects               — top-level academic subjects
  topics                 — subject sub-topics with difficulty
  learning_objectives    — ordered learning goals per topic
  concepts               — structured knowledge units per topic
  misconceptions         — common errors the AI can flag
  learning_activities    — ordered activity steps per topic
  questions              — assessments per topic / activity
  resources              — linked learning materials per topic
  learning_sessions      — a live peer-learning session
  session_activity_results — student responses inside a session
  topic_progress         — one progress record per user per topic
  resource_downloads     — log of user resource downloads
"""
from __future__ import annotations

from datetime import datetime, timezone
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


# ── Valid enum-like constants (enforced in Pydantic, stored as plain strings) ──

ACTIVITY_TYPES  = {"learn", "explain", "practice", "challenge", "check"}
QUESTION_TYPES  = {"multiple_choice", "short_answer", "numeric", "explanation"}
RESOURCE_TYPES  = {"video", "textbook", "pdf", "study_guide", "tutorial"}
SESSION_STATUSES = {"pending", "active", "completed", "cancelled"}
SESSION_STAGES   = {"learn", "explain", "practice", "challenge", "check", "completed"}


# ─────────────────────────────────────────────────────────────────────────────
# 1. SUBJECTS
# ─────────────────────────────────────────────────────────────────────────────

class Subject(Base):
    __tablename__ = "subjects"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:        Mapped[str]           = mapped_column(String(120), unique=True, nullable=False)
    slug:        Mapped[str]           = mapped_column(String(120), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon:        Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    is_active:   Mapped[bool]          = mapped_column(Boolean, default=True, nullable=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topics: Mapped[list["Topic"]] = relationship("Topic", back_populates="subject", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "icon": self.icon,
            "isActive": self.is_active,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 2. TOPICS
# ─────────────────────────────────────────────────────────────────────────────

class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("subject_id", "slug", name="uq_topic_subject_slug"),
    )

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_id:  Mapped[int]           = mapped_column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    name:        Mapped[str]           = mapped_column(String(200), nullable=False)
    slug:        Mapped[str]           = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    difficulty:  Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # e.g. beginner / intermediate / advanced
    is_active:   Mapped[bool]          = mapped_column(Boolean, default=True, nullable=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    subject:            Mapped["Subject"]                    = relationship("Subject", back_populates="topics")
    learning_objectives:Mapped[list["LearningObjective"]]    = relationship("LearningObjective", back_populates="topic", cascade="all, delete-orphan", order_by="LearningObjective.order_index")
    concepts:           Mapped[list["Concept"]]              = relationship("Concept", back_populates="topic", cascade="all, delete-orphan")
    misconceptions:     Mapped[list["Misconception"]]        = relationship("Misconception", back_populates="topic", cascade="all, delete-orphan")
    learning_activities:Mapped[list["LearningActivity"]]     = relationship("LearningActivity", back_populates="topic", cascade="all, delete-orphan", order_by="LearningActivity.order_index")
    questions:          Mapped[list["Question"]]             = relationship("Question", back_populates="topic", cascade="all, delete-orphan")
    resources:          Mapped[list["Resource"]]             = relationship("Resource", back_populates="topic")
    learning_sessions:  Mapped[list["LearningSession"]]      = relationship("LearningSession", back_populates="topic")
    topic_progress:     Mapped[list["TopicProgress"]]        = relationship("TopicProgress", back_populates="topic", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "subjectId": self.subject_id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "difficulty": self.difficulty,
            "isActive": self.is_active,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. LEARNING OBJECTIVES
# ─────────────────────────────────────────────────────────────────────────────

class LearningObjective(Base):
    __tablename__ = "learning_objectives"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    title:       Mapped[str]      = mapped_column(String(300), nullable=False)
    description: Mapped[str]      = mapped_column(Text, nullable=False)
    order_index: Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic: Mapped["Topic"] = relationship("Topic", back_populates="learning_objectives")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "title": self.title,
            "description": self.description,
            "orderIndex": self.order_index,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CONCEPTS
# ─────────────────────────────────────────────────────────────────────────────

class Concept(Base):
    __tablename__ = "concepts"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    name:        Mapped[str]      = mapped_column(String(200), nullable=False)
    explanation: Mapped[str]      = mapped_column(Text, nullable=False)
    # Stored as a JSON array of strings, e.g. ["velocity can change in magnitude", ...]
    key_points:  Mapped[list]     = mapped_column(JSONB, nullable=False, default=list)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic:         Mapped["Topic"]              = relationship("Topic", back_populates="concepts")
    misconceptions:Mapped[list["Misconception"]]= relationship("Misconception", back_populates="concept")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "name": self.name,
            "explanation": self.explanation,
            "keyPoints": self.key_points or [],
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 5. MISCONCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class Misconception(Base):
    __tablename__ = "misconceptions"

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    concept_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True, index=True)
    misconception:Mapped[str]           = mapped_column(Text, nullable=False)
    correction:   Mapped[str]           = mapped_column(Text, nullable=False)
    hint:         Mapped[str]           = mapped_column(Text, nullable=False)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic:   Mapped["Topic"]            = relationship("Topic", back_populates="misconceptions")
    concept: Mapped[Optional["Concept"]]= relationship("Concept", back_populates="misconceptions")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "conceptId": self.concept_id,
            "misconception": self.misconception,
            "correction": self.correction,
            "hint": self.hint,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 6. LEARNING ACTIVITIES
# ─────────────────────────────────────────────────────────────────────────────

class LearningActivity(Base):
    __tablename__ = "learning_activities"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:    Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    # learn | explain | practice | challenge | check
    type:        Mapped[str]           = mapped_column(String(40), nullable=False)
    title:       Mapped[str]           = mapped_column(String(300), nullable=False)
    prompt:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_index: Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    # Arbitrary structured data (e.g. time limits, hints, config flags)
    # Named 'activity_metadata' in Python to avoid collision with SQLAlchemy's
    # reserved 'metadata' attribute; the DB column is named 'metadata'.
    activity_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic:    Mapped["Topic"]                       = relationship("Topic", back_populates="learning_activities")
    questions:Mapped[list["Question"]]              = relationship("Question", back_populates="activity")
    results:  Mapped[list["SessionActivityResult"]] = relationship("SessionActivityResult", back_populates="activity")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "type": self.type,
            "title": self.title,
            "prompt": self.prompt,
            "orderIndex": self.order_index,
            "metadata": self.activity_metadata,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 7. QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

class Question(Base):
    __tablename__ = "questions"

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("learning_activities.id", ondelete="SET NULL"), nullable=True, index=True)
    question:     Mapped[str]           = mapped_column(Text, nullable=False)
    # multiple_choice | short_answer | numeric | explanation
    question_type:Mapped[str]           = mapped_column(String(40), nullable=False)
    difficulty:   Mapped[str]           = mapped_column(String(40), nullable=False)
    answer:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    explanation:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hint:         Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # For multiple_choice: [{"label": "A", "text": "..."}, ...]
    options:      Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic:    Mapped["Topic"]                        = relationship("Topic", back_populates="questions")
    activity: Mapped[Optional["LearningActivity"]]   = relationship("LearningActivity", back_populates="questions")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "activityId": self.activity_id,
            "question": self.question,
            "questionType": self.question_type,
            "difficulty": self.difficulty,
            "answer": self.answer,
            "explanation": self.explanation,
            "hint": self.hint,
            "options": self.options,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 8. RESOURCES
# ─────────────────────────────────────────────────────────────────────────────

class Resource(Base):
    __tablename__ = "resources"

    id:              Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    title:           Mapped[str]           = mapped_column(String(300), nullable=False)
    description:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # video | textbook | pdf | study_guide | tutorial
    type:            Mapped[str]           = mapped_column(String(40), nullable=False)
    url:             Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_url:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thumbnail_url:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration:        Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # e.g. "12:34" or "45 min"
    # Only true when PeerUP legally owns distribution rights
    is_downloadable: Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    source:          Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_verified:     Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    created_by:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    topic:    Mapped[Optional["Topic"]] = relationship("Topic", back_populates="resources")
    creator:  Mapped[Optional["User"]]  = relationship(  # type: ignore[name-defined]
        "User", back_populates="created_resources", foreign_keys=[created_by]
    )
    downloads:Mapped[list["ResourceDownload"]] = relationship("ResourceDownload", back_populates="resource", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "topicId": self.topic_id,
            "title": self.title,
            "description": self.description,
            "type": self.type,
            "url": self.url,
            "fileUrl": self.file_url,
            "thumbnailUrl": self.thumbnail_url,
            "duration": self.duration,
            "isDownloadable": self.is_downloadable,
            "source": self.source,
            "isVerified": self.is_verified,
            "createdBy": self.created_by,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 9. LEARNING SESSIONS
# ─────────────────────────────────────────────────────────────────────────────

class LearningSession(Base):
    __tablename__ = "learning_sessions"
    __table_args__ = (
        Index("idx_learning_sessions_creator",  "creator_id"),
        Index("idx_learning_sessions_partner",  "partner_id"),
        Index("idx_learning_sessions_topic",    "topic_id"),
        Index("idx_learning_sessions_status",   "status"),
    )

    id:            Mapped[int]               = mapped_column(Integer, primary_key=True, autoincrement=True)
    creator_id:    Mapped[int]               = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Nullable until a partner joins (status="pending" → partner_id is NULL)
    partner_id:    Mapped[Optional[int]]     = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    topic_id:      Mapped[int]               = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    goal:          Mapped[str]               = mapped_column(Text, nullable=False)
    # pending | active | completed | cancelled
    status:        Mapped[str]               = mapped_column(String(20), default="pending", nullable=False)
    # learn | explain | practice | challenge | check | completed
    current_stage: Mapped[str]               = mapped_column(String(20), default="learn", nullable=False)
    # Short human-readable join code, e.g. "NLM-4827"
    session_code:  Mapped[Optional[str]]     = mapped_column(String(12), unique=True, nullable=True, index=True)
    started_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:    Mapped[datetime]           = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:    Mapped[datetime]           = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    creator:          Mapped["User"]                        = relationship(  # type: ignore[name-defined]
        "User", back_populates="learning_sessions_as_creator", foreign_keys=[creator_id]
    )
    partner:          Mapped[Optional["User"]]              = relationship(  # type: ignore[name-defined]
        "User", back_populates="learning_sessions_as_partner", foreign_keys=[partner_id]
    )
    topic:            Mapped["Topic"]                       = relationship("Topic", back_populates="learning_sessions")
    activity_results: Mapped[list["SessionActivityResult"]] = relationship("SessionActivityResult", back_populates="session", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "creatorId": self.creator_id,
            "partnerId": self.partner_id,
            "topicId": self.topic_id,
            "goal": self.goal,
            "status": self.status,
            "currentStage": self.current_stage,
            "sessionCode": self.session_code,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 10. SESSION ACTIVITY RESULTS
# ─────────────────────────────────────────────────────────────────────────────

class SessionActivityResult(Base):
    __tablename__ = "session_activity_results"

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:        Mapped[int]           = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_id:    Mapped[int]           = mapped_column(Integer, ForeignKey("learning_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    response:       Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_correct:     Mapped[Optional[bool]]= mapped_column(Boolean, nullable=True)
    ai_feedback:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hint:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry:          Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    attempt_number: Mapped[int]           = mapped_column(Integer, default=1, nullable=False)
    score:          Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    session:  Mapped["LearningSession"]  = relationship("LearningSession", back_populates="activity_results")
    user:     Mapped["User"]             = relationship(  # type: ignore[name-defined]
        "User", back_populates="session_activity_results", foreign_keys=[user_id]
    )
    activity: Mapped["LearningActivity"] = relationship("LearningActivity", back_populates="results")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "activityId": self.activity_id,
            "response": self.response,
            "isCorrect": self.is_correct,
            "aiFeedback": self.ai_feedback,
            "hint": self.hint,
            "retry": self.retry,
            "attemptNumber": self.attempt_number,
            "score": self.score,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 11. TOPIC PROGRESS
# ─────────────────────────────────────────────────────────────────────────────

class TopicProgress(Base):
    __tablename__ = "topic_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "topic_id", name="uq_topic_progress_user_topic"),
    )

    id:                 Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:            Mapped[int]           = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    topic_id:           Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    understanding_score:Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100
    practice_score:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100
    sessions_completed: Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    needs_review:       Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    last_studied_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:         Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:         Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    user:  Mapped["User"]  = relationship("User", back_populates="topic_progress")  # type: ignore[name-defined]
    topic: Mapped["Topic"] = relationship("Topic", back_populates="topic_progress")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "topicId": self.topic_id,
            "understandingScore": self.understanding_score,
            "practiceScore": self.practice_score,
            "sessionsCompleted": self.sessions_completed,
            "needsReview": self.needs_review,
            "lastStudiedAt": self.last_studied_at.isoformat() if self.last_studied_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# 12. RESOURCE DOWNLOADS
# ─────────────────────────────────────────────────────────────────────────────

class ResourceDownload(Base):
    __tablename__ = "resource_downloads"
    __table_args__ = (
        # Allow tracking multiple downloads; index for fast lookup per user/resource
        Index("idx_resource_downloads_user",     "user_id"),
        Index("idx_resource_downloads_resource", "resource_id"),
    )

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resource_id:   Mapped[int]      = mapped_column(Integer, ForeignKey("resources.id", ondelete="CASCADE"), nullable=False)
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    # Relationships
    user:     Mapped["User"]     = relationship("User", back_populates="resource_downloads")  # type: ignore[name-defined]
    resource: Mapped["Resource"] = relationship("Resource", back_populates="downloads")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "resourceId": self.resource_id,
            "downloadedAt": self.downloaded_at.isoformat(),
        }
