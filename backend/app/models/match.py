"""MatchRequest ORM model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MatchRequest(Base):
    __tablename__ = "match_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receiver_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # "learn" = sender wants to learn from receiver
    # "teach" = sender wants to teach receiver
    mode: Mapped[str] = mapped_column(String(10), nullable=False)
    subject: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # "pending" | "accepted" | "declined"
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], lazy="selectin")  # type: ignore[name-defined]
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id], lazy="selectin")  # type: ignore[name-defined]

    def serialize(self, perspective_user_id: int) -> dict:
        from app.services.chat_service import _serialize_partner  # avoid circular import
        return {
            "id": self.id,
            "senderId": self.sender_id,
            "receiverId": self.receiver_id,
            "sender": _serialize_partner(self.sender),
            "receiver": _serialize_partner(self.receiver),
            "mode": self.mode,
            "subject": self.subject,
            "message": self.message,
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
        }
