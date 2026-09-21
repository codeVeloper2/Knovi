"""Pydantic schemas for the AI Learning Profile endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import Field, field_validator

from app.schemas.base import StrictModel


# ── Observation shape (written by AI, never by the student directly) ──────────

class LearningObservation(StrictModel):
    """
    A single structured observation written by the AI after a learning event.

    category:    "teaching_strategy" | "misconception" | "strength" | "struggle"
                 | "engagement" | "performance"
    observation: Human-readable evidence statement (not a diagnosis).
    strategy:    Relevant teaching strategy (for teaching_strategy category).
    confidence:  0.0 – 1.0.  Only record when confidence > 0.5.
    source:      Where the evidence came from.
    session_id:  The AI learning session that produced this observation.
    """

    type: str = Field(default="learning_observation")
    category: str = Field(max_length=40)
    observation: str = Field(min_length=10, max_length=500)
    strategy: Optional[str] = Field(default=None, max_length=60)
    confidence: float = Field(ge=0.0, le=1.0)
    source: str = Field(max_length=60)
    session_id: Optional[int] = None
    created_at: Optional[str] = None  # ISO string; set by the service

    @field_validator("confidence")
    @classmethod
    def round_confidence(cls, v: float) -> float:
        return round(v, 2)


# ── Student-reported profile (read / write) ───────────────────────────────────

class LearningProfileUpdate(StrictModel):
    """
    Request body for PUT /api/learning/profile.

    Only the five student-editable fields are accepted here.
    ai_observations is never updated via this endpoint — only appended
    server-side by the AI observation service.
    """

    strengths: list[str] = Field(default_factory=list)
    struggles: list[str] = Field(default_factory=list)
    learning_preferences: list[str] = Field(
        default_factory=list,
        alias="learningPreferences",
    )
    learning_behavior: list[str] = Field(
        default_factory=list,
        alias="learningBehavior",
    )
    personal_note: str = Field(
        default="",
        alias="personalNote",
        max_length=2000,
    )

    model_config = {"populate_by_name": True}

    @field_validator("strengths", "struggles", "learning_preferences", "learning_behavior", mode="before")
    @classmethod
    def cap_items(cls, v: Any) -> list[str]:
        if not isinstance(v, list):
            return []
        # Deduplicate, strip, max 30 items, max 100 chars each
        seen: set[str] = set()
        result: list[str] = []
        for item in v:
            s = str(item).strip()[:100]
            if s and s not in seen:
                seen.add(s)
                result.append(s)
            if len(result) >= 30:
                break
        return result


# ── Response shape ─────────────────────────────────────────────────────────────

class LearningProfileOut(StrictModel):
    """
    Response for GET /api/learning/profile and PUT /api/learning/profile.
    Mirrors AILearningProfile.serialize().
    """

    userId: int
    strengths: list[str] = []
    struggles: list[str] = []
    learningPreferences: list[str] = []
    learningBehavior: list[str] = []
    personalNote: str = ""
    aiObservations: list[dict] = []
    createdAt: str
    updatedAt: str

    model_config = {"from_attributes": True}
