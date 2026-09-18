"""Pydantic schemas for the new AI Learning Session system.

Request bodies use StrictModel (extra="forbid").
Response schemas (*Out) use plain BaseModel and match each model's serialize().
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.base import StrictModel
from app.models.ai_learning import (
    FAMILIARITY_OPTIONS, INTENT_OPTIONS, SESSION_STATUSES,
    AI_QUESTION_TYPES, TEACHING_STRATEGIES, INTEGRITY_EVENT_TYPES,
)


# ─────────────────────────────────────────────────────────────────────────────
# SESSION CREATION
# ─────────────────────────────────────────────────────────────────────────────

class CreateSessionRequest(StrictModel):
    subject_id:          int
    topic_id:            int
    concept_id:          int
    student_familiarity: str = Field(default="new")
    student_note:        Optional[str] = Field(default=None, max_length=1000)
    intent:              str = Field(default="teach_me")
    custom_intent_text:  Optional[str] = Field(default=None, max_length=500)

    @field_validator("student_familiarity")
    @classmethod
    def validate_familiarity(cls, v: str) -> str:
        if v not in FAMILIARITY_OPTIONS:
            raise ValueError(f"student_familiarity must be one of {sorted(FAMILIARITY_OPTIONS)}")
        return v

    @field_validator("intent")
    @classmethod
    def validate_intent(cls, v: str) -> str:
        if v not in INTENT_OPTIONS:
            raise ValueError(f"intent must be one of {sorted(INTENT_OPTIONS)}")
        return v


# ─────────────────────────────────────────────────────────────────────────────
# SESSION RESPONSE
# ─────────────────────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id:                 int
    userId:             int
    subjectId:          int
    topicId:            int
    conceptId:          int
    studentFamiliarity: str
    studentNote:        Optional[str]
    intent:             str
    customIntentText:   Optional[str]
    status:             str
    startedAt:          Optional[str]
    completedAt:        Optional[str]
    createdAt:          str
    updatedAt:          str

    # Optionally hydrated
    subject:   Optional[dict] = None
    topic:     Optional[dict] = None
    concept:   Optional[dict] = None
    messages:  Optional[list] = None
    teaching:  Optional[dict] = None
    summary:   Optional[dict] = None


# ─────────────────────────────────────────────────────────────────────────────
# MESSAGES
# ─────────────────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    id:          int
    sessionId:   int
    role:        str
    messageType: str
    content:     str
    sequence:    int
    extra:       Optional[dict]
    createdAt:   str


# ─────────────────────────────────────────────────────────────────────────────
# TEACHING
# ─────────────────────────────────────────────────────────────────────────────

class TeachingOut(BaseModel):
    id:            int
    sessionId:     int
    strategy:      str
    attemptNumber: int
    explanation:   Optional[str]
    keyPoints:     list
    examples:      list
    formulas:      list
    analogies:     list
    workedExamples:list
    misconceptions:list
    summary:       Optional[str]
    rawContent:    Optional[str]
    isCurrent:     bool
    createdAt:     str


# ─────────────────────────────────────────────────────────────────────────────
# STUDY TIMER
# ─────────────────────────────────────────────────────────────────────────────

class StartStudyPeriodRequest(StrictModel):
    duration_seconds: int = Field(default=300, ge=30, le=3600)


class FinishStudyPeriodRequest(StrictModel):
    study_period_id: int


class StudyPeriodOut(BaseModel):
    id:              int
    sessionId:       int
    durationSeconds: int
    startedAt:       str
    expectedEndAt:   Optional[str]
    endedAt:         Optional[str]
    timerStatus:     str
    createdAt:       str


# ─────────────────────────────────────────────────────────────────────────────
# RETRIEVAL QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

class QuestionOut(BaseModel):
    id:           int
    sessionId:    int
    question:     str
    questionType: str
    options:      Optional[list]
    sequence:     int
    createdAt:    str
    # expected_answer / rubric intentionally excluded from student-facing schema


# ─────────────────────────────────────────────────────────────────────────────
# ANSWER SUBMISSION
# ─────────────────────────────────────────────────────────────────────────────

class SubmitAnswerRequest(StrictModel):
    question_id:           int
    student_answer:        str = Field(min_length=1, max_length=5000)
    response_time_seconds: Optional[int] = Field(default=None, ge=0)


class AnswerOut(BaseModel):
    id:                  int
    sessionId:           int
    questionId:          int
    studentAnswer:       str
    attemptNumber:       int
    isCorrect:           Optional[bool]
    score:               Optional[int]
    feedback:            Optional[str]
    responseTimeSeconds: Optional[int]
    createdAt:           str
    # Evaluation fields (populated after AI evaluation)
    understanding:       Optional[str] = None   # strong | partial | weak
    needsReteach:        Optional[bool] = None
    misconception:       Optional[str] = None
    recommendedStrategy: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# ADAPTIVE RETEACHING
# ─────────────────────────────────────────────────────────────────────────────

class RequestReteachRequest(StrictModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class TeachingAttemptOut(BaseModel):
    id:                 int
    sessionId:          int
    attemptNumber:      int
    strategy:           str
    reason:             Optional[str]
    teachingSnapshotId: Optional[int]
    outcome:            Optional[str]
    createdAt:          str


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY EVENTS
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityEventRequest(StrictModel):
    event_type: str
    meta:       Optional[dict[str, Any]] = None

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        if v not in INTEGRITY_EVENT_TYPES:
            raise ValueError(f"event_type must be one of {sorted(INTEGRITY_EVENT_TYPES)}")
        return v


class IntegrityEventOut(BaseModel):
    id:         int
    sessionId:  int
    eventType:  str
    occurredAt: str
    meta:       Optional[dict]


# ─────────────────────────────────────────────────────────────────────────────
# SESSION SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

class SummaryOut(BaseModel):
    id:                  int
    sessionId:           int
    summaryText:         Optional[str]
    keyIdeas:            list
    strengths:           list
    areasForPractice:    list
    recommendedNext:     Optional[str]
    teachingMethodsUsed: list
    questionsAnswered:   int
    questionsCorrect:    int
    reteachCount:        int
    overallScore:        Optional[int]
    createdAt:           str


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT MESSAGE (free-form chat in learning room)
# ─────────────────────────────────────────────────────────────────────────────

class StudentMessageRequest(StrictModel):
    content: str = Field(min_length=1, max_length=4000)


# ─────────────────────────────────────────────────────────────────────────────
# SESSION LIST (history)
# ─────────────────────────────────────────────────────────────────────────────

class SessionListItem(BaseModel):
    id:                 int
    subjectId:          int
    topicId:            int
    conceptId:          int
    studentFamiliarity: str
    intent:             str
    status:             str
    startedAt:          Optional[str]
    completedAt:        Optional[str]
    createdAt:          str
    # Hydrated names
    subjectName:        Optional[str] = None
    topicName:          Optional[str] = None
    conceptName:        Optional[str] = None
    overallScore:       Optional[int] = None
