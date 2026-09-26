"""Feedback request schemas."""
from __future__ import annotations

from typing import Optional

from pydantic import Field

from app.schemas.base import StrictModel


class FeedbackRequest(StrictModel):
    """General product feedback or an AI-response flag."""

    kind: str = Field(
        description="'general' | 'ai_flag'",
        min_length=3,
        max_length=32,
    )
    message: str = Field(
        description="User's written feedback or reason for flagging",
        min_length=1,
        max_length=4000,
    )
    page: Optional[str] = Field(default=None, max_length=200)
    # AI flag context
    session_id: Optional[int] = None
    subject_name: Optional[str] = Field(default=None, max_length=200)
    topic_name: Optional[str] = Field(default=None, max_length=200)
    concept_name: Optional[str] = Field(default=None, max_length=200)
    task_index: Optional[int] = None
    task_title: Optional[str] = Field(default=None, max_length=300)
    student_message: Optional[str] = Field(default=None, max_length=4000)
    ai_message: Optional[str] = Field(default=None, max_length=8000)
    ai_message_id: Optional[int] = None
