"""Study Room ORM models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class StudyRoom(Base):
    """A collaborative study session linked to a chat conversation."""
    __tablename__ = "study_rooms"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Linked conversation (and therefore the two participants + subject)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Who started the session
    creator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    # "teaching" | "learning" — the creator's declared role for this session
    creator_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Session lifecycle
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Whether both users have joined
    partner_joined: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Shared notes (plain text / markdown — no encryption needed for notes)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Whiteboard state — serialised JSON (array of stroke objects)
    whiteboard: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Rating submitted after session ends (1-5, null if not rated)
    rating_by_creator: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rating_by_partner: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Soft-delete per participant — each can hide the session from their own history
    hidden_for_creator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hidden_for_partner: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    materials: Mapped[list["RoomMaterial"]] = relationship(
        "RoomMaterial", back_populates="room",
        cascade="all, delete-orphan", lazy="selectin",
    )

    def serialize(self, my_id: int) -> dict:
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "creatorId": self.creator_id,
            "goal": self.goal,
            "subject": self.subject,
            "creatorRole": self.creator_role,
            "myRole": self.creator_role if self.creator_id == my_id
                      else ("learning" if self.creator_role == "teaching" else "teaching") if self.creator_role
                      else None,
            "startedAt": self.started_at.isoformat(),
            "endedAt": self.ended_at.isoformat() if self.ended_at else None,
            "durationMinutes": self.duration_minutes,
            "partnerJoined": self.partner_joined,
            "notes": self.notes or "",
            "whiteboard": self.whiteboard or [],
            "materials": [m.serialize() for m in (self.materials or [])],
            "isCreator": self.creator_id == my_id,
            "ratingByMe": self.rating_by_creator if self.creator_id == my_id else self.rating_by_partner,
        }


class RoomMaterial(Base):
    """A file/link uploaded to a study room."""
    __tablename__ = "room_materials"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("study_rooms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    uploader_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String(40), default="file", nullable=False)  # file/image/pdf/link
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    room: Mapped["StudyRoom"] = relationship("StudyRoom", back_populates="materials")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "roomId": self.room_id,
            "uploaderId": self.uploader_id,
            "name": self.name,
            "url": self.url,
            "fileType": self.file_type,
            "sizeBytes": self.size_bytes,
            "createdAt": self.created_at.isoformat(),
        }
