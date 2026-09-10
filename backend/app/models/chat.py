"""Chat ORM models: Conversation + Message.

Messages are stored encrypted (AES-256-GCM) via the encrypt/decrypt helpers
in app.services.crypto_service. The `body` column holds the ciphertext; the
plaintext is never written to the DB.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import ARRAY, BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    """A private 1-on-1 study conversation between two users.

    user_a_id < user_b_id is enforced at creation time so there is never a
    duplicate row for the same pair.
    """
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Participants — always stored with the lower id first.
    user_a_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_b_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    subject: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    session_goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    last_message_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="conversation",
        cascade="all, delete-orphan", lazy="dynamic",
    )

    def partner_id(self, my_id: int) -> int:
        return self.user_b_id if self.user_a_id == my_id else self.user_a_id

    def serialize(self, my_id: int, partner: dict, last_msg: Optional[dict] = None, unread: int = 0) -> dict:
        return {
            "id": self.id,
            "partnerId": self.partner_id(my_id),
            "partner": partner,
            "subject": self.subject,
            "sessionGoal": self.session_goal,
            "lastMessage": last_msg,
            "unread": unread,
            "createdAt": self.created_at.isoformat(),
            "lastMessageAt": self.last_message_at.isoformat() if self.last_message_at else None,
        }


class Message(Base):
    """A single chat message. `body` is AES-256-GCM encrypted ciphertext."""
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Encrypted ciphertext (base64url-encoded nonce + tag + ciphertext).
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Optional file/image attachment.
    attachment_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Reply-to: stores the id of the message being replied to + a plain-text
    # snapshot of its body so we can render quotes without decrypting again.
    reply_to_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )
    reply_to_snapshot: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Reactions: { "👍": [userId, ...], "❤️": [userId, ...], ... }
    reactions: Mapped[Optional[dict]] = mapped_column(JSON, default=None, nullable=True)

    is_delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Soft delete — set when sender deletes for everyone.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # hidden_for — list of user IDs who deleted this message "for me only".
    hidden_for: Mapped[Optional[list]] = mapped_column(
        ARRAY(Integer), default=None, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="messages"
    )

    def serialize(self, plaintext_body: str, viewer_id: Optional[int] = None) -> dict:
        """Return a dict with the decrypted body — never the raw ciphertext."""
        is_deleted = self.deleted_at is not None
        is_hidden = viewer_id is not None and viewer_id in (self.hidden_for or [])
        redact = is_deleted or is_hidden
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "senderId": self.sender_id,
            "body": "" if redact else plaintext_body,
            "attachmentUrl": None if redact else self.attachment_url,
            "attachmentName": None if redact else self.attachment_name,
            "replyToId": self.reply_to_id,
            "replyToSnapshot": self.reply_to_snapshot,
            "reactions": self.reactions or {},
            "isDelivered": self.is_delivered,
            "isRead": self.is_read,
            "reported": self.reported,
            "deleted": is_deleted,
            "hiddenForMe": is_hidden,
            "createdAt": self.created_at.isoformat(),
        }
