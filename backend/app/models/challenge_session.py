"""ChallengeSession ORM model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


CHALLENGE_STATUSES = {
    "waiting",       # initiator waiting for a partner
    "lobby",         # partner joined, both confirming ready
    "questions",     # both answering the 5 AI-generated questions
    "peer_exchange", # peer-to-peer question round
    "evaluating",    # AI computing final result
    "completed",     # both passed
    "failed",        # one or both failed — triggers reteach
    "cancelled",     # partner left or timeout
}


class ChallengeSession(Base):
    __tablename__ = "challenge_sessions"

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    concept_id:   Mapped[int]           = mapped_column(Integer, ForeignKey("concepts.id",  ondelete="CASCADE"), nullable=False, index=True)
    topic_id:     Mapped[int]           = mapped_column(Integer, ForeignKey("topics.id",    ondelete="CASCADE"), nullable=False)
    subject_id:   Mapped[int]           = mapped_column(Integer, ForeignKey("subjects.id",  ondelete="CASCADE"), nullable=False)
    initiator_id: Mapped[int]           = mapped_column(Integer, ForeignKey("users.id",     ondelete="CASCADE"), nullable=False, index=True)
    partner_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id",     ondelete="SET NULL"), nullable=True,  index=True)

    status:       Mapped[str]  = mapped_column(String(30), default="waiting", nullable=False, index=True)

    initiator_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    partner_ready:   Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 5 AI-generated questions
    questions:              Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    questions_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Independent answers from each student
    initiator_answers: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    partner_answers:   Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    initiator_score:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    partner_score:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Peer exchange Q&A
    peer_exchanges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Final evaluation
    initiator_passed:   Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    partner_passed:     Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    evaluation_result:  Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    evaluated_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Heartbeat / expiry
    initiator_last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    partner_last_seen:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:          Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    started_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    initiator: Mapped["User"] = relationship("User", foreign_keys=[initiator_id])  # type: ignore
    partner:   Mapped[Optional["User"]] = relationship("User", foreign_keys=[partner_id])  # type: ignore
    concept:   Mapped["Concept"] = relationship("Concept")  # type: ignore

    def serialize(self, viewer_id: int | None = None) -> dict:
        """Serialize, hiding the other player's answers until evaluation is done."""
        is_initiator = viewer_id == self.initiator_id
        is_partner   = viewer_id == self.partner_id

        # Only reveal other side's answers after evaluation
        reveal_answers = self.status in ("evaluating", "completed", "failed")

        return {
            "id": self.id,
            "conceptId": self.concept_id,
            "topicId": self.topic_id,
            "subjectId": self.subject_id,
            "status": self.status,
            "initiatorId": self.initiator_id,
            "partnerId": self.partner_id,
            "initiatorReady": self.initiator_ready,
            "partnerReady": self.partner_ready,
            "questions": self.questions,
            "myAnswers": (
                self.initiator_answers if is_initiator else
                self.partner_answers   if is_partner   else []
            ),
            # Only expose opponent's answers after answers are locked in
            "partnerAnswers": (
                (self.partner_answers if is_initiator else self.initiator_answers)
                if reveal_answers else None
            ),
            "myScore": (
                self.initiator_score if is_initiator else
                self.partner_score   if is_partner   else None
            ),
            "peerExchanges": self.peer_exchanges or [],
            "myRole": (
                "initiator" if is_initiator else
                "partner"   if is_partner   else "observer"
            ),
            "myPassed": (
                self.initiator_passed if is_initiator else
                self.partner_passed   if is_partner   else None
            ),
            "evaluationResult": self.evaluation_result if reveal_answers else None,
            "initiator": {
                "id": self.initiator_id,
                "displayName": self.initiator.full_name if self.initiator else None,
                "photoUrl": self.initiator.photo_url if self.initiator else None,
            } if self.initiator else None,
            "partner": {
                "id": self.partner_id,
                "displayName": self.partner.full_name if self.partner else None,
                "photoUrl": self.partner.photo_url if self.partner else None,
            } if self.partner else None,
            "startedAt":   self.started_at.isoformat()   if self.started_at   else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "expiresAt":   self.expires_at.isoformat()   if self.expires_at   else None,
            "createdAt":   self.created_at.isoformat(),
        }
