"""Pydantic request/response schemas for the Curriculum Admin API.

All request bodies use StrictModel (extra="forbid") so typos are caught
immediately at the API boundary.  Response shapes use plain BaseModel.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.base import StrictModel
from app.models.curriculum import (
    ACTIVITY_TYPES, QUESTION_TYPES, RESOURCE_TYPES,
    SESSION_STATUSES, SESSION_STAGES,
)


# ─────────────────────────────────────────────────────────────────────────────
# SUBJECTS
# ─────────────────────────────────────────────────────────────────────────────

class SubjectCreate(StrictModel):
    name:        str            = Field(min_length=1, max_length=120)
    slug:        str            = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    icon:        Optional[str] = None
    is_active:   bool          = True


class SubjectUpdate(StrictModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=120)
    slug:        Optional[str]  = Field(default=None, min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    icon:        Optional[str] = None
    is_active:   Optional[bool] = None


class SubjectOut(BaseModel):
    id:          int
    name:        str
    slug:        str
    description: Optional[str]
    icon:        Optional[str]
    is_active:   bool
    created_at:  str
    updated_at:  str


# ─────────────────────────────────────────────────────────────────────────────
# TOPICS
# ─────────────────────────────────────────────────────────────────────────────

class TopicCreate(StrictModel):
    subject_id:  int
    name:        str            = Field(min_length=1, max_length=200)
    slug:        str            = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    difficulty:  Optional[str] = Field(default=None, max_length=40)
    is_active:   bool          = True


class TopicUpdate(StrictModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=200)
    slug:        Optional[str]  = Field(default=None, min_length=1, max_length=200, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    difficulty:  Optional[str] = Field(default=None, max_length=40)
    is_active:   Optional[bool] = None


class TopicOut(BaseModel):
    id:          int
    subject_id:  int
    name:        str
    slug:        str
    description: Optional[str]
    difficulty:  Optional[str]
    is_active:   bool
    created_at:  str
    updated_at:  str


# ─────────────────────────────────────────────────────────────────────────────
# LEARNING OBJECTIVES
# ─────────────────────────────────────────────────────────────────────────────

class ObjectiveCreate(StrictModel):
    title:       str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1)
    order_index: int = Field(default=0, ge=0)


class ObjectiveUpdate(StrictModel):
    title:       Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, min_length=1)
    order_index: Optional[int] = Field(default=None, ge=0)


class ObjectiveOut(BaseModel):
    id:          int
    topic_id:    int
    title:       str
    description: str
    order_index: int
    created_at:  str
    updated_at:  str


# ─────────────────────────────────────────────────────────────────────────────
# CONCEPTS
# ─────────────────────────────────────────────────────────────────────────────

class ConceptCreate(StrictModel):
    name:        str       = Field(min_length=1, max_length=200)
    explanation: str       = Field(min_length=1)
    key_points:  list[str] = Field(default_factory=list)

    @field_validator("key_points")
    @classmethod
    def key_points_not_empty_strings(cls, v: list[str]) -> list[str]:
        return [p.strip() for p in v if p.strip()]


class ConceptUpdate(StrictModel):
    name:        Optional[str]       = Field(default=None, min_length=1, max_length=200)
    explanation: Optional[str]       = Field(default=None, min_length=1)
    key_points:  Optional[list[str]] = None

    @field_validator("key_points")
    @classmethod
    def key_points_not_empty_strings(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        return [p.strip() for p in v if p.strip()]


class ConceptOut(BaseModel):
    id:          int
    topic_id:    int
    name:        str
    explanation: str
    key_points:  list[str]
    created_at:  str
    updated_at:  str


# ─────────────────────────────────────────────────────────────────────────────
# MISCONCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class MisconceptionCreate(StrictModel):
    misconception: str           = Field(min_length=1)
    correction:    str           = Field(min_length=1)
    hint:          str           = Field(min_length=1)
    concept_id:    Optional[int] = None


class MisconceptionUpdate(StrictModel):
    misconception: Optional[str] = Field(default=None, min_length=1)
    correction:    Optional[str] = Field(default=None, min_length=1)
    hint:          Optional[str] = Field(default=None, min_length=1)
    concept_id:    Optional[int] = None


class MisconceptionOut(BaseModel):
    id:            int
    topic_id:      int
    concept_id:    Optional[int]
    misconception: str
    correction:    str
    hint:          str
    created_at:    str
    updated_at:    str


# ─────────────────────────────────────────────────────────────────────────────
# LEARNING ACTIVITIES
# ─────────────────────────────────────────────────────────────────────────────

class ActivityCreate(StrictModel):
    type:              str                    = Field(min_length=1, max_length=40)
    title:             str                    = Field(min_length=1, max_length=300)
    prompt:            Optional[str]          = None
    order_index:       int                    = Field(default=0, ge=0)
    activity_metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata")

    model_config = {"populate_by_name": True}

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ACTIVITY_TYPES:
            raise ValueError(f"type must be one of {sorted(ACTIVITY_TYPES)}")
        return v


class ActivityUpdate(StrictModel):
    type:              Optional[str]            = Field(default=None, max_length=40)
    title:             Optional[str]            = Field(default=None, min_length=1, max_length=300)
    prompt:            Optional[str]            = None
    order_index:       Optional[int]            = Field(default=None, ge=0)
    activity_metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata")

    model_config = {"populate_by_name": True}

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ACTIVITY_TYPES:
            raise ValueError(f"type must be one of {sorted(ACTIVITY_TYPES)}")
        return v


class ActivityOut(BaseModel):
    id:          int
    topic_id:    int
    type:        str
    title:       str
    prompt:      Optional[str]
    order_index: int
    metadata:    Optional[dict[str, Any]]
    created_at:  str
    updated_at:  str


# ─────────────────────────────────────────────────────────────────────────────
# QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

class QuestionCreate(StrictModel):
    question:      str                     = Field(min_length=1)
    question_type: str                     = Field(min_length=1, max_length=40)
    difficulty:    str                     = Field(min_length=1, max_length=40)
    answer:        Optional[str]           = None
    explanation:   Optional[str]           = None
    hint:          Optional[str]           = None
    options:       Optional[list[Any]]     = None
    activity_id:   Optional[int]           = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        if v not in QUESTION_TYPES:
            raise ValueError(f"question_type must be one of {sorted(QUESTION_TYPES)}")
        return v


class QuestionUpdate(StrictModel):
    question:      Optional[str]           = Field(default=None, min_length=1)
    question_type: Optional[str]           = Field(default=None, max_length=40)
    difficulty:    Optional[str]           = Field(default=None, max_length=40)
    answer:        Optional[str]           = None
    explanation:   Optional[str]           = None
    hint:          Optional[str]           = None
    options:       Optional[list[Any]]     = None
    activity_id:   Optional[int]           = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in QUESTION_TYPES:
            raise ValueError(f"question_type must be one of {sorted(QUESTION_TYPES)}")
        return v


class QuestionOut(BaseModel):
    id:            int
    topic_id:      int
    activity_id:   Optional[int]
    question:      str
    question_type: str
    difficulty:    str
    answer:        Optional[str]
    explanation:   Optional[str]
    hint:          Optional[str]
    options:       Optional[list[Any]]
    created_at:    str
    updated_at:    str


# ─────────────────────────────────────────────────────────────────────────────
# RESOURCES
# ─────────────────────────────────────────────────────────────────────────────

class ResourceCreate(StrictModel):
    title:           str            = Field(min_length=1, max_length=300)
    type:            str            = Field(min_length=1, max_length=40)
    description:     Optional[str] = None
    url:             Optional[str] = None
    file_url:        Optional[str] = None
    thumbnail_url:   Optional[str] = None
    duration:        Optional[str] = Field(default=None, max_length=40)
    is_downloadable: bool          = False
    source:          Optional[str] = Field(default=None, max_length=200)
    is_verified:     bool          = False

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in RESOURCE_TYPES:
            raise ValueError(f"type must be one of {sorted(RESOURCE_TYPES)}")
        return v


class ResourceUpdate(StrictModel):
    title:           Optional[str]  = Field(default=None, min_length=1, max_length=300)
    type:            Optional[str]  = Field(default=None, max_length=40)
    description:     Optional[str] = None
    url:             Optional[str] = None
    file_url:        Optional[str] = None
    thumbnail_url:   Optional[str] = None
    duration:        Optional[str] = Field(default=None, max_length=40)
    is_downloadable: Optional[bool] = None
    source:          Optional[str] = Field(default=None, max_length=200)
    is_verified:     Optional[bool] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RESOURCE_TYPES:
            raise ValueError(f"type must be one of {sorted(RESOURCE_TYPES)}")
        return v


class ResourceOut(BaseModel):
    id:              int
    topic_id:        Optional[int]
    title:           str
    type:            str
    description:     Optional[str]
    url:             Optional[str]
    file_url:        Optional[str]
    thumbnail_url:   Optional[str]
    duration:        Optional[str]
    is_downloadable: bool
    source:          Optional[str]
    is_verified:     bool
    created_by:      Optional[int]
    created_at:      str
    updated_at:      str


# ─────────────────────────────────────────────────────────────────────────────
# TOPIC DETAIL (admin full view)
# ─────────────────────────────────────────────────────────────────────────────

class TopicDetailOut(BaseModel):
    """Full topic view including all related curriculum content."""
    id:                  int
    subject_id:          int
    name:                str
    slug:                str
    description:         Optional[str]
    difficulty:          Optional[str]
    is_active:           bool
    created_at:          str
    updated_at:          str
    learning_objectives: list[ObjectiveOut]   = []
    concepts:            list[ConceptOut]     = []
    misconceptions:      list[MisconceptionOut] = []
    learning_activities: list[ActivityOut]   = []
    questions:           list[QuestionOut]   = []
    resources:           list[ResourceOut]   = []
