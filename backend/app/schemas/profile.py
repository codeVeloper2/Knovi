"""Profile-related request/response schemas."""
from __future__ import annotations

from pydantic import Field, field_validator

from app.schemas.base import StrictModel


class ProfileUpdate(StrictModel):
    displayName: str = Field(min_length=1, max_length=80)
    grade: str = Field(min_length=1, max_length=40)
    subjectsGoodAt: list[str] = []
    subjectsNeedHelp: list[str] = []
    skillLevel: str = Field(default="Intermediate", max_length=40)
    language: str = Field(default="", max_length=60)
    bio: str = Field(default="", max_length=1000)
    photoURL: str = Field(default="", max_length=2048)
    isPublic: bool = True
    allowDirectMessage: bool = True

    @field_validator("photoURL")
    @classmethod
    def validate_photo_url(cls, v: str) -> str:
        if v and not v.startswith("https://"):
            raise ValueError("photoURL must be an HTTPS URL")
        return v


class PrivacyUpdate(StrictModel):
    isPublic: bool
    allowDirectMessage: bool
