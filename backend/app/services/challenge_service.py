"""Server-authoritative AI Quiz Battle business logic."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.ai_learning import AILearningSession, AISessionQuestion
from app.models.chat import Conversation
from app.models.challenge import (
    CHALLENGE_STATUSES,
    ChallengeAnswer,
    ChallengeQuestion,
    ChallengeResult,
    ChallengeSession,
    ChallengeMatchQueue,
)
from app.models.curriculum import Concept, LearningObjective, Subject, Topic
from app.models.user import User
from app.services import learning_profile_service as lp_svc
from app.services import progress_service
from app.services.challenge_ai_service import (
    ChallengePreparationError,
    build_blueprint,
    load_challenge_context,
    generate_question_set,
    ai_validate_question_set,
    select_relevant_session,
    validate_ai_result,
    validate_questions_deterministically,
)
from app.schemas.challenge import ChallengeBlueprint

logger = logging.getLogger(__name__)


# Product configuration. These are the only challenge constants that intentionally
# define behavior rather than learner data.
DEFAULT_QUESTION_COUNT = settings.CHALLENGE_QUESTION_COUNT
MIN_QUESTION_COUNT = settings.CHALLENGE_MIN_QUESTIONS
MAX_QUESTION_COUNT = settings.CHALLENGE_MAX_QUESTIONS
COUNTDOWN_SECONDS = settings.CHALLENGE_COUNTDOWN_SECONDS
QUESTION_DURATION_SECONDS = settings.CHALLENGE_QUESTION_SECONDS
REVEAL_SECONDS = settings.CHALLENGE_REVEAL_SECONDS
PENDING_TTL = timedelta(hours=settings.CHALLENGE_PENDING_HOURS)
ACCEPTED_TTL = timedelta(minutes=settings.CHALLENGE_ACCEPTED_MINUTES)
BATTLE_TTL = timedelta(hours=settings.CHALLENGE_BATTLE_HOURS)
PREPARATION_TIMEOUT = timedelta(minutes=settings.CHALLENGE_PREPARATION_MINUTES)
DISCONNECT_GRACE = timedelta(seconds=settings.CHALLENGE_DISCONNECT_GRACE_SECONDS)
AI_PREPARATION_RETRIES = settings.CHALLENGE_AI_RETRIES
LIST_LIMIT_MAX = 50


VALID_TRANSITIONS: dict[str, set[str]] = {
    "created": {"pending", "cancelled"},
    "pending": {"accepted", "declined", "cancelled", "expired"},
    "accepted": {"preparing", "cancelled", "expired"},
    "preparing": {"waiting", "accepted", "expired"},
    "waiting": {"countdown", "cancelled", "expired"},
    "countdown": {"question_active", "cancelled", "expired"},
    "question_active": {"waiting_for_opponent", "question_reveal", "expired"},
    "waiting_for_opponent": {"question_reveal", "expired"},
    "question_reveal": {"next_question", "completed", "expired"},
    "next_question": {"question_active", "completed", "expired"},
    "completed": set(),
    "declined": set(),
    "cancelled": set(),
    "expired": set(),
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _transition(challenge: ChallengeSession, new_status: str) -> None:
    current = challenge.status
    if new_status == current:
        return
    if current not in VALID_TRANSITIONS or new_status not in VALID_TRANSITIONS[current]:
        raise HTTPException(
            409,
            f"Challenge cannot move from '{current}' to '{new_status}'.",
        )
    challenge.status = new_status


def _role(challenge: ChallengeSession, user_id: int) -> str:
    if challenge.challenger_id == user_id:
        return "challenger"
    if challenge.opponent_id is not None and challenge.opponent_id == user_id:
        return "opponent"
    raise HTTPException(403, "You are not a participant in this challenge.")


def _participant_ids(challenge: ChallengeSession) -> tuple[int, ...]:
    if challenge.challenge_mode == "ai" or challenge.opponent_id is None:
        return (challenge.challenger_id,)
    return challenge.challenger_id, challenge.opponent_id


async def _get_participant_locked(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> ChallengeSession:
    challenge = (
        await db.execute(
            select(ChallengeSession)
            .where(ChallengeSession.id == challenge_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if challenge is None:
        raise HTTPException(404, "Challenge not found.")
    _role(challenge, user_id)
    return challenge


async def _load_users(
    ids: set[int],
    db: AsyncSession,
) -> dict[int, User]:
    if not ids:
        return {}
    rows = (
        await db.execute(select(User).where(User.id.in_(ids)))
    ).scalars().all()
    return {row.id: row for row in rows}


async def _load_curriculum(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> tuple[Subject, Topic, Concept]:
    subject = (
        await db.execute(select(Subject).where(Subject.id == challenge.subject_id))
    ).scalar_one_or_none()
    topic = (
        await db.execute(select(Topic).where(Topic.id == challenge.topic_id))
    ).scalar_one_or_none()
    concept = (
        await db.execute(select(Concept).where(Concept.id == challenge.concept_id))
    ).scalar_one_or_none()
    if not subject or not topic or not concept:
        raise HTTPException(409, "Challenge curriculum is no longer available.")
    if not subject.is_active or not topic.is_active:
        raise HTTPException(409, "Challenge curriculum is no longer active.")
    if topic.subject_id != subject.id or concept.topic_id != topic.id:
        raise HTTPException(409, "Challenge curriculum hierarchy is invalid.")
    return subject, topic, concept


async def _is_connected(
    user_a_id: int,
    user_b_id: int,
    db: AsyncSession,
) -> bool:
    pair = or_(
        and_(
            Conversation.user_a_id == user_a_id,
            Conversation.user_b_id == user_b_id,
        ),
        and_(
            Conversation.user_a_id == user_b_id,
            Conversation.user_b_id == user_a_id,
        ),
    )
    found = (
        await db.execute(select(Conversation.id).where(pair).limit(1))
    ).scalar_one_or_none()
    return found is not None


async def _get_source_sessions(
    challenger_id: int,
    opponent_id: int,
    concept_id: int,
    subject_id: int,
    topic_id: int,
    db: AsyncSession,
) -> tuple[AILearningSession, AILearningSession]:
    session_a = await select_relevant_session(challenger_id, concept_id, db)
    session_b = await select_relevant_session(opponent_id, concept_id, db)
    if not session_a or not session_b:
        raise HTTPException(
            422,
            "Both students need a meaningful AI learning session for this concept before they can challenge each other.",
        )

    for session, owner in ((session_a, challenger_id), (session_b, opponent_id)):
        if (
            session.user_id != owner
            or session.subject_id != subject_id
            or session.topic_id != topic_id
            or session.concept_id != concept_id
        ):
            raise HTTPException(
                409,
                "The selected AI learning sessions do not match the requested curriculum context.",
            )

    return session_a, session_b


async def create_challenge(
    *,
    challenger_id: int,
    opponent_id: int,
    subject_id: int,
    topic_id: int,
    concept_id: int,
    question_count: int,
    db: AsyncSession,
) -> ChallengeSession:
    if challenger_id == opponent_id:
        raise HTTPException(400, "You cannot challenge yourself.")
    if question_count < MIN_QUESTION_COUNT or question_count > MAX_QUESTION_COUNT:
        raise HTTPException(
            422,
            f"question_count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.",
        )

    if not await _is_connected(challenger_id, opponent_id, db):
        # This repository currently has no dedicated friendship table. Its live
        # peer connection primitive is the 1-to-1 Conversation, so challenge
        # eligibility is intentionally bound to an existing conversation.
        raise HTTPException(
            403,
            "AI Quiz Battle is available only between students who are already connected in PeerUP.",
        )

    users = await _load_users({challenger_id, opponent_id}, db)
    challenger = users.get(challenger_id)
    opponent = users.get(opponent_id)
    if not challenger or not opponent:
        raise HTTPException(404, "One of the selected students no longer exists.")
    if not opponent.profile_complete:
        raise HTTPException(409, "The selected opponent has not completed their PeerUP profile.")

    subject = (
        await db.execute(
            select(Subject).where(
                Subject.id == subject_id,
                Subject.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    topic = (
        await db.execute(
            select(Topic)
            .options(selectinload(Topic.learning_objectives))
            .where(Topic.id == topic_id)
        )
    ).scalar_one_or_none()
    concept = (
        await db.execute(select(Concept).where(Concept.id == concept_id))
    ).scalar_one_or_none()
    if not subject or not topic or not concept:
        raise HTTPException(404, "The selected curriculum item was not found.")
    if topic.subject_id != subject.id or concept.topic_id != topic.id:
        raise HTTPException(422, "The supplied curriculum hierarchy is invalid.")

    session_a, session_b = await _get_source_sessions(
        challenger_id,
        opponent_id,
        concept_id,
        subject_id,
        topic_id,
        db,
    )

    # Validate the core challenge condition up front. We deliberately refuse to
    # create a battle that cannot later be prepared safely.
    try:
        await load_challenge_context(
            challenger_id=challenger_id,
            opponent_id=opponent_id,
            subject=subject,
            topic=topic,
            concept=concept,
            session_a=session_a,
            session_b=session_b,
        )
    except ChallengePreparationError as exc:
        raise HTTPException(422, str(exc)) from exc

    # Avoid duplicate live challenges regardless of which participant created the row.
    active_statuses = {
        "pending", "accepted", "preparing", "waiting", "countdown",
        "question_active", "waiting_for_opponent", "question_reveal", "next_question",
    }
    same_pair = or_(
        and_(
            ChallengeSession.challenger_id == challenger_id,
            ChallengeSession.opponent_id == opponent_id,
        ),
        and_(
            ChallengeSession.challenger_id == opponent_id,
            ChallengeSession.opponent_id == challenger_id,
        ),
    )
    duplicate = (
        await db.execute(
            select(ChallengeSession.id)
            .where(
                same_pair,
                ChallengeSession.concept_id == concept_id,
                ChallengeSession.status.in_(active_statuses),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409, "You already have an active challenge for this concept with this student.")

    challenge = ChallengeSession(
        challenger_id=challenger_id,
        opponent_id=opponent_id,
        subject_id=subject_id,
        topic_id=topic_id,
        concept_id=concept_id,
        source_session_a_id=session_a.id,
        source_session_b_id=session_b.id,
        status="pending",
        question_count=question_count,
        current_question=0,
        expires_at=now_utc() + PENDING_TTL,
        challenge_metadata={
            "version": 1,
            "source": "ai_learning",
            "eligibility": "existing_conversation",
        },
    )
    db.add(challenge)
    try:
        await db.commit()
        await db.refresh(challenge)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "This challenge could not be created because it conflicts with another active challenge.") from exc

    logger.info(
        "challenge_created challenge_id=%s challenger_id=%s opponent_id=%s concept_id=%s",
        challenge.id, challenger_id, opponent_id, concept_id,
    )
    return challenge


async def _load_and_validate_curriculum(
    *, subject_id: int, topic_id: int, concept_id: int, db: AsyncSession
) -> tuple[Subject, Topic, Concept]:
    subject = (await db.execute(select(Subject).where(Subject.id == subject_id, Subject.is_active.is_(True)))).scalar_one_or_none()
    topic = (await db.execute(select(Topic).options(selectinload(Topic.learning_objectives)).where(Topic.id == topic_id))).scalar_one_or_none()
    concept = (await db.execute(select(Concept).where(Concept.id == concept_id))).scalar_one_or_none()
    if not subject or not topic or not concept:
        raise HTTPException(404, "The selected curriculum item was not found.")
    if topic.subject_id != subject.id or concept.topic_id != topic.id:
        raise HTTPException(422, "The supplied curriculum hierarchy is invalid.")
    return subject, topic, concept


async def _load_completed_session(
    *, user_id: int, session_id: int, subject_id: int, topic_id: int, concept_id: int, db: AsyncSession
) -> AILearningSession:
    session = (await db.execute(
        select(AILearningSession)
        .options(selectinload(AILearningSession.teaching), selectinload(AILearningSession.questions).selectinload(AISessionQuestion.answers), selectinload(AILearningSession.summary))
        .where(AILearningSession.id == session_id, AILearningSession.user_id == user_id)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "The AI learning session was not found.")
    if (session.subject_id, session.topic_id, session.concept_id) != (subject_id, topic_id, concept_id):
        raise HTTPException(409, "The learning session does not match the selected curriculum context.")
    if session.status != "completed":
        raise HTTPException(409, "You must complete all AI learning checks for this topic before entering a Challenge.")
    if not session.teaching:
        raise HTTPException(409, "The completed AI learning session has no teaching evidence.")
    return session


async def create_peer_challenge_from_sessions(
    *, challenger_id: int, opponent_id: int, subject_id: int, topic_id: int, concept_id: int,
    source_session_a_id: int, source_session_b_id: int, question_count: int, db: AsyncSession,
    commit: bool = True,
) -> ChallengeSession:
    if challenger_id == opponent_id:
        raise HTTPException(400, "You cannot challenge yourself.")
    if question_count < MIN_QUESTION_COUNT or question_count > MAX_QUESTION_COUNT:
        raise HTTPException(422, f"question_count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.")
    subject, topic, concept = await _load_and_validate_curriculum(
        subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db
    )
    session_a = await _load_completed_session(user_id=challenger_id, session_id=source_session_a_id, subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db)
    session_b = await _load_completed_session(user_id=opponent_id, session_id=source_session_b_id, subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db)
    try:
        await load_challenge_context(challenger_id=challenger_id, opponent_id=opponent_id, subject=subject, topic=topic, concept=concept, session_a=session_a, session_b=session_b)
    except ChallengePreparationError as exc:
        raise HTTPException(422, str(exc)) from exc
    active_statuses = {"pending", "accepted", "preparing", "waiting", "countdown", "question_active", "waiting_for_opponent", "question_reveal", "next_question"}
    duplicate = (await db.execute(select(ChallengeSession.id).where(
        or_(and_(ChallengeSession.challenger_id == challenger_id, ChallengeSession.opponent_id == opponent_id), and_(ChallengeSession.challenger_id == opponent_id, ChallengeSession.opponent_id == challenger_id)),
        ChallengeSession.concept_id == concept_id, ChallengeSession.status.in_(active_statuses)
    ).limit(1))).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409, "These students already have an active challenge for this concept.")
    challenge = ChallengeSession(
        challenger_id=challenger_id, opponent_id=opponent_id, challenge_mode="peer",
        subject_id=subject_id, topic_id=topic_id, concept_id=concept_id,
        source_session_a_id=session_a.id, source_session_b_id=session_b.id,
        status="pending", question_count=question_count, current_question=0,
        expires_at=now_utc() + PENDING_TTL,
        challenge_metadata={"version": 2, "source": "automatic_matchmaking", "eligibility": "completed_ai_learning"},
    )
    db.add(challenge)
    try:
        if commit:
            await db.commit(); await db.refresh(challenge)
        else:
            await db.flush()
    except IntegrityError as exc:
        await db.rollback(); raise HTTPException(409, "This peer challenge is already being created.") from exc
    return challenge


async def create_ai_challenge(
    *, user_id: int, subject_id: int, topic_id: int, concept_id: int, source_session_id: int, question_count: int, db: AsyncSession
) -> ChallengeSession:
    if question_count < MIN_QUESTION_COUNT or question_count > MAX_QUESTION_COUNT:
        raise HTTPException(422, f"question_count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.")
    subject, topic, concept = await _load_and_validate_curriculum(subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db)
    source = await _load_completed_session(user_id=user_id, session_id=source_session_id, subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db)
    active = (await db.execute(select(ChallengeSession.id).where(
        ChallengeSession.challenger_id == user_id, ChallengeSession.challenge_mode == "ai", ChallengeSession.concept_id == concept_id,
        ChallengeSession.status.in_({"accepted", "preparing", "waiting", "countdown", "question_active", "waiting_for_opponent", "question_reveal", "next_question"})
    ).limit(1))).scalar_one_or_none()
    if active is not None:
        raise HTTPException(409, "You already have an active AI Challenge for this concept.")
    challenge = ChallengeSession(
        challenger_id=user_id, opponent_id=None, challenge_mode="ai",
        subject_id=subject_id, topic_id=topic_id, concept_id=concept_id,
        source_session_a_id=source.id, source_session_b_id=source.id,
        status="accepted", question_count=question_count, current_question=0,
        accepted_at=now_utc(), expires_at=now_utc() + ACCEPTED_TTL,
        challenge_metadata={"version": 2, "source": "ai_fallback", "eligibility": "completed_ai_learning"},
    )
    db.add(challenge); await db.commit(); await db.refresh(challenge)
    return challenge


async def _find_waiting_candidate(
    *,
    user_id: int,
    subject_id: int,
    topic_id: int,
    concept_id: int,
    class_level: str,
    now: datetime,
    db: AsyncSession,
) -> ChallengeMatchQueue | None:
    """Pick another waiting student for the same curriculum context.

    Prefer the same class level when available, but fall back to any class so
    two students who finished the same concept are not stranded in the queue
    because of a profile grade mismatch.
    """
    base = (
        ChallengeMatchQueue.status == "waiting",
        ChallengeMatchQueue.user_id != user_id,
        ChallengeMatchQueue.subject_id == subject_id,
        ChallengeMatchQueue.topic_id == topic_id,
        ChallengeMatchQueue.concept_id == concept_id,
        ChallengeMatchQueue.expires_at > now,
    )
    preferred = None
    if (class_level or "").strip():
        preferred = (
            await db.execute(
                select(ChallengeMatchQueue)
                .where(*base, ChallengeMatchQueue.class_level == class_level)
                .order_by(ChallengeMatchQueue.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(1)
            )
        ).scalar_one_or_none()
    if preferred is not None:
        return preferred
    return (
        await db.execute(
            select(ChallengeMatchQueue)
            .where(*base)
            .order_by(ChallengeMatchQueue.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
    ).scalar_one_or_none()


async def _pair_waiting_students(
    *,
    candidate: ChallengeMatchQueue,
    joiner_user_id: int,
    joiner_source_session_id: int,
    joiner_class_level: str,
    question_count: int,
    db: AsyncSession,
) -> tuple[ChallengeMatchQueue, ChallengeSession]:
    """Create an accepted peer challenge and mark both queue rows matched."""
    challenge = await create_peer_challenge_from_sessions(
        challenger_id=candidate.user_id,
        opponent_id=joiner_user_id,
        subject_id=candidate.subject_id,
        topic_id=candidate.topic_id,
        concept_id=candidate.concept_id,
        source_session_a_id=candidate.source_session_id,
        source_session_b_id=joiner_source_session_id,
        question_count=question_count,
        db=db,
        commit=False,
    )
    matched_at = now_utc()
    # Matchmaking means both students have already opted into the Challenge;
    # there is no second manual invitation/acceptance step.
    challenge.status = "accepted"
    challenge.accepted_at = matched_at
    challenge.expires_at = matched_at + ACCEPTED_TTL
    candidate.status = "matched"
    candidate.challenge_id = challenge.id
    candidate.matched_at = matched_at
    queue = ChallengeMatchQueue(
        user_id=joiner_user_id,
        subject_id=candidate.subject_id,
        topic_id=candidate.topic_id,
        concept_id=candidate.concept_id,
        source_session_id=joiner_source_session_id,
        class_level=joiner_class_level or "",
        status="matched",
        challenge_id=challenge.id,
        matched_at=matched_at,
        expires_at=matched_at + PENDING_TTL,
    )
    db.add(queue)
    await db.commit()
    await db.refresh(candidate)
    await db.refresh(queue)
    return queue, challenge


async def join_matchmaking(
    *, user_id: int, subject_id: int, topic_id: int, concept_id: int, source_session_id: int, class_level: str, question_count: int, db: AsyncSession
) -> tuple[ChallengeMatchQueue, ChallengeSession | None]:
    source = await _load_completed_session(
        user_id=user_id, session_id=source_session_id,
        subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db,
    )
    await _load_and_validate_curriculum(subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, db=db)
    now = now_utc()
    await db.execute(
        ChallengeMatchQueue.__table__.update()
        .where(ChallengeMatchQueue.status == "waiting", ChallengeMatchQueue.expires_at <= now)
        .values(status="expired")
    )

    # Any prior waiting row for a *different* concept must not block this join.
    stale_waiting = (
        await db.execute(
            select(ChallengeMatchQueue).where(
                ChallengeMatchQueue.user_id == user_id,
                ChallengeMatchQueue.status == "waiting",
                or_(
                    ChallengeMatchQueue.subject_id != subject_id,
                    ChallengeMatchQueue.topic_id != topic_id,
                    ChallengeMatchQueue.concept_id != concept_id,
                ),
            ).with_for_update()
        )
    ).scalars().all()
    for row in stale_waiting:
        row.status = "cancelled"

    # Already matched for this concept → return that result.
    existing_matched = (
        await db.execute(
            select(ChallengeMatchQueue).where(
                ChallengeMatchQueue.user_id == user_id,
                ChallengeMatchQueue.status == "matched",
                ChallengeMatchQueue.subject_id == subject_id,
                ChallengeMatchQueue.topic_id == topic_id,
                ChallengeMatchQueue.concept_id == concept_id,
            ).order_by(ChallengeMatchQueue.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if existing_matched is not None:
        challenge = None
        if existing_matched.challenge_id:
            challenge = await db.get(ChallengeSession, existing_matched.challenge_id)
        await db.commit()
        return existing_matched, challenge

    # Already waiting for this concept → try pairing again (covers the race
    # where both students inserted waiting rows at the same time).
    existing_waiting = (
        await db.execute(
            select(ChallengeMatchQueue).where(
                ChallengeMatchQueue.user_id == user_id,
                ChallengeMatchQueue.status == "waiting",
                ChallengeMatchQueue.subject_id == subject_id,
                ChallengeMatchQueue.topic_id == topic_id,
                ChallengeMatchQueue.concept_id == concept_id,
            ).with_for_update().limit(1)
        )
    ).scalar_one_or_none()

    candidate = await _find_waiting_candidate(
        user_id=user_id,
        subject_id=subject_id,
        topic_id=topic_id,
        concept_id=concept_id,
        class_level=class_level or "",
        now=now,
        db=db,
    )
    if candidate is not None:
        if existing_waiting is not None:
            # Pair using the existing waiting row as the joiner side.
            challenge = await create_peer_challenge_from_sessions(
                challenger_id=candidate.user_id,
                opponent_id=user_id,
                subject_id=subject_id,
                topic_id=topic_id,
                concept_id=concept_id,
                source_session_a_id=candidate.source_session_id,
                source_session_b_id=existing_waiting.source_session_id,
                question_count=question_count,
                db=db,
                commit=False,
            )
            matched_at = now_utc()
            challenge.status = "accepted"
            challenge.accepted_at = matched_at
            challenge.expires_at = matched_at + ACCEPTED_TTL
            candidate.status = "matched"
            candidate.challenge_id = challenge.id
            candidate.matched_at = matched_at
            existing_waiting.status = "matched"
            existing_waiting.challenge_id = challenge.id
            existing_waiting.matched_at = matched_at
            await db.commit()
            await db.refresh(existing_waiting)
            return existing_waiting, challenge

        return await _pair_waiting_students(
            candidate=candidate,
            joiner_user_id=user_id,
            joiner_source_session_id=source.id,
            joiner_class_level=class_level or "",
            question_count=question_count,
            db=db,
        )

    if existing_waiting is not None:
        # Still alone in the queue for this concept.
        existing_waiting.expires_at = now + PENDING_TTL
        existing_waiting.source_session_id = source.id
        existing_waiting.class_level = class_level or existing_waiting.class_level or ""
        await db.commit()
        await db.refresh(existing_waiting)
        return existing_waiting, None

    queue = ChallengeMatchQueue(
        user_id=user_id,
        subject_id=subject_id,
        topic_id=topic_id,
        concept_id=concept_id,
        source_session_id=source.id,
        class_level=class_level or "",
        status="waiting",
        expires_at=now + PENDING_TTL,
    )
    db.add(queue)
    await db.commit()
    await db.refresh(queue)
    return queue, None


async def matchmaking_status(user_id: int, db: AsyncSession) -> dict[str, Any]:
    now = now_utc()
    await db.execute(
        ChallengeMatchQueue.__table__.update()
        .where(ChallengeMatchQueue.status == "waiting", ChallengeMatchQueue.expires_at <= now)
        .values(status="expired")
    )

    row = (
        await db.execute(
            select(ChallengeMatchQueue)
            .where(ChallengeMatchQueue.user_id == user_id, ChallengeMatchQueue.status.in_({"waiting", "matched"}))
            .order_by(ChallengeMatchQueue.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not row:
        await db.commit()
        return {"status": "none", "queueId": None, "challengeId": None}

    if row.status == "waiting":
        # Re-attempt pairing on every status poll so concurrent "both waiting"
        # joins still resolve without requiring a second explicit join.
        candidate = await _find_waiting_candidate(
            user_id=user_id,
            subject_id=row.subject_id,
            topic_id=row.topic_id,
            concept_id=row.concept_id,
            class_level=row.class_level or "",
            now=now,
            db=db,
        )
        if candidate is not None:
            try:
                challenge = await create_peer_challenge_from_sessions(
                    challenger_id=candidate.user_id,
                    opponent_id=user_id,
                    subject_id=row.subject_id,
                    topic_id=row.topic_id,
                    concept_id=row.concept_id,
                    source_session_a_id=candidate.source_session_id,
                    source_session_b_id=row.source_session_id,
                    question_count=5,
                    db=db,
                    commit=False,
                )
                matched_at = now_utc()
                challenge.status = "accepted"
                challenge.accepted_at = matched_at
                challenge.expires_at = matched_at + ACCEPTED_TTL
                candidate.status = "matched"
                candidate.challenge_id = challenge.id
                candidate.matched_at = matched_at
                row.status = "matched"
                row.challenge_id = challenge.id
                row.matched_at = matched_at
                await db.commit()
                await db.refresh(row)
            except HTTPException:
                # Opponent may have become ineligible; keep waiting.
                await db.rollback()
                row = (
                    await db.execute(
                        select(ChallengeMatchQueue)
                        .where(ChallengeMatchQueue.user_id == user_id, ChallengeMatchQueue.status.in_({"waiting", "matched"}))
                        .order_by(ChallengeMatchQueue.created_at.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if not row:
                    return {"status": "none", "queueId": None, "challengeId": None}
        else:
            await db.commit()

    if row.status == "waiting" and row.expires_at <= now_utc():
        row.status = "expired"
        await db.commit()
        return {"status": "expired", "queueId": row.id, "challengeId": None}

    return {
        "status": row.status,
        "queueId": row.id,
        "challengeId": row.challenge_id,
        "subjectId": row.subject_id,
        "topicId": row.topic_id,
        "conceptId": row.concept_id,
    }


async def leave_matchmaking(user_id: int, db: AsyncSession) -> dict[str, Any]:
    rows = (await db.execute(select(ChallengeMatchQueue).where(ChallengeMatchQueue.user_id == user_id, ChallengeMatchQueue.status == "waiting").with_for_update())).scalars().all()
    for row in rows:
        row.status = "cancelled"
    await db.commit()
    return {"status": "cancelled", "cancelled": len(rows)}


async def accept_challenge(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> ChallengeSession:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    if challenge.opponent_id != user_id:
        raise HTTPException(403, "Only the intended opponent can accept this challenge.")

    stale_changed = await _expire_if_stale_locked(challenge, db)
    if challenge.status != "pending":
        if stale_changed:
            await db.commit()
            await db.refresh(challenge)
        raise HTTPException(409, f"Challenge cannot be accepted while it is '{challenge.status}'.")

    now = now_utc()
    _transition(challenge, "accepted")
    challenge.accepted_at = now
    challenge.expires_at = now + ACCEPTED_TTL
    challenge.preparation_error = None
    await db.commit()
    await db.refresh(challenge)
    logger.info("challenge_accepted challenge_id=%s user_id=%s", challenge.id, user_id)
    return challenge


async def decline_challenge(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> ChallengeSession:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    if challenge.opponent_id != user_id:
        raise HTTPException(403, "Only the intended opponent can decline this challenge.")

    stale_changed = await _expire_if_stale_locked(challenge, db)
    if challenge.status != "pending":
        if stale_changed:
            await db.commit()
            await db.refresh(challenge)
        raise HTTPException(409, f"Challenge cannot be declined while it is '{challenge.status}'.")

    _transition(challenge, "declined")
    challenge.completed_at = now_utc()
    challenge.expires_at = challenge.completed_at
    await db.commit()
    await db.refresh(challenge)
    logger.info("challenge_declined challenge_id=%s user_id=%s", challenge.id, user_id)
    return challenge


async def _load_frozen_source_session(
    session_id: Optional[int],
    *,
    owner_id: int,
    concept_id: int,
    db: AsyncSession,
) -> Optional[AILearningSession]:
    if session_id is None:
        return None
    result = await db.execute(
        select(AILearningSession)
        .options(
            selectinload(AILearningSession.teaching),
            selectinload(AILearningSession.questions).selectinload(AISessionQuestion.answers),
            selectinload(AILearningSession.summary),
        )
        .where(
            AILearningSession.id == session_id,
            AILearningSession.user_id == owner_id,
            AILearningSession.concept_id == concept_id,
        )
    )
    return result.scalar_one_or_none()


async def prepare_challenge(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> ChallengeSession:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    stale_changed = await _expire_if_stale_locked(challenge, db)
    if stale_changed and challenge.status == "expired":
        await db.commit()
        await db.refresh(challenge)

    if challenge.status == "waiting":
        # Already prepared. Do not regenerate questions.
        return challenge
    if challenge.status != "accepted":
        if challenge.status == "preparing":
            raise HTTPException(409, "Challenge preparation is already in progress.")
        raise HTTPException(409, f"Challenge cannot be prepared while it is '{challenge.status}'.")

    now = now_utc()
    _transition(challenge, "preparing")
    challenge.preparation_started_at = now
    challenge.preparation_error = None
    await db.commit()

    try:
        subject = (
            await db.execute(select(Subject).where(Subject.id == challenge.subject_id))
        ).scalar_one_or_none()
        topic = (
            await db.execute(
                select(Topic)
                .options(selectinload(Topic.learning_objectives))
                .where(Topic.id == challenge.topic_id)
            )
        ).scalar_one_or_none()
        concept = (
            await db.execute(select(Concept).where(Concept.id == challenge.concept_id))
        ).scalar_one_or_none()

        if not subject or not topic or not concept:
            raise ChallengePreparationError("Challenge curriculum is no longer available.")

        source_a = await _load_frozen_source_session(
            challenge.source_session_a_id,
            owner_id=challenge.challenger_id,
            concept_id=challenge.concept_id,
            db=db,
        )
        source_b = await _load_frozen_source_session(
            challenge.source_session_b_id,
            owner_id=challenge.opponent_id if challenge.opponent_id is not None else challenge.challenger_id,
            concept_id=challenge.concept_id,
            db=db,
        )
        if not source_a or not source_b:
            raise ChallengePreparationError(
                "The source AI learning sessions used for this challenge are no longer available."
            )

        context_a, context_b, shared_objectives = await load_challenge_context(
            challenger_id=challenge.challenger_id,
            opponent_id=challenge.opponent_id if challenge.opponent_id is not None else challenge.challenger_id,
            subject=subject,
            topic=topic,
            concept=concept,
            session_a=source_a,
            session_b=source_b,
        )
        blueprint = build_blueprint(
            subject=subject,
            topic=topic,
            concept=concept,
            question_count=challenge.question_count,
            context_a=context_a,
            context_b=context_b,
            shared_objectives=shared_objectives,
        )

        generated = None
        generation_provider = "unknown"
        validation_errors: list[str] = []
        for attempt in range(1, AI_PREPARATION_RETRIES + 1):
            try:
                candidate, generation_provider = await generate_question_set(
                    blueprint=blueprint,
                    subject=subject,
                    topic=topic,
                    concept=concept,
                    context_a=context_a,
                    context_b=context_b,
                )
                validation_errors = validate_questions_deterministically(candidate, blueprint)
                if validation_errors:
                    logger.warning(
                        "challenge_question_deterministic_validation_failed challenge_id=%s attempt=%s errors=%s",
                        challenge.id, attempt, validation_errors,
                    )
                    continue

                ai_validation = await ai_validate_question_set(
                    question_set=candidate,
                    blueprint=blueprint,
                    subject=subject,
                    topic=topic,
                    concept=concept,
                )
                validation_errors = validate_ai_result(ai_validation, challenge.question_count)
                if validation_errors:
                    logger.warning(
                        "challenge_question_ai_validation_failed challenge_id=%s attempt=%s errors=%s",
                        challenge.id, attempt, validation_errors,
                    )
                    continue
                generated = candidate
                break
            except Exception as exc:  # AI/provider/schema failures are retriable.
                validation_errors = [str(exc)][:5]
                logger.warning(
                    "challenge_question_generation_attempt_failed challenge_id=%s attempt=%s error=%s",
                    challenge.id, attempt, exc,
                )

        if generated is None:
            raise ChallengePreparationError(
                "AI Quiz Battle could not safely prepare its questions after validation retries."
            )

        # Final database lock: a second prepare request can no longer have entered
        # because the challenge was marked preparing, but we still re-check before
        # writing the immutable question snapshot.
        challenge = (
            await db.execute(
                select(ChallengeSession)
                .where(ChallengeSession.id == challenge_id)
                .with_for_update()
            )
        ).scalar_one()
        if challenge.status == "waiting" and challenge.questions:
            return challenge
        if challenge.status != "preparing":
            raise HTTPException(409, f"Challenge preparation state changed to '{challenge.status}'.")

        for question in generated.questions:
            objective_id = question.objectiveId
            db.add(
                ChallengeQuestion(
                    challenge_id=challenge.id,
                    question_number=question.questionNumber,
                    objective_id=objective_id,
                    question=question.question,
                    options={option.label: option.text for option in question.options},
                    correct_answer=question.correctAnswer,
                    explanation=question.explanation,
                    difficulty=question.difficulty.value,
                    generation_metadata={
                        "provider": generation_provider,
                        "generator": "ai_quiz_battle_v1",
                        "validated": True,
                    },
                )
            )

        _transition(challenge, "waiting")
        challenge.preparation_started_at = None
        challenge.preparation_error = None
        challenge.expires_at = now_utc() + ACCEPTED_TTL
        challenge.challenge_metadata = {
            **(challenge.challenge_metadata or {}),
            "blueprint": blueprint.model_dump(mode="json"),
            "question_generation": {
                "provider": generation_provider,
                "validated": True,
                "question_count": len(generated.questions),
            },
            "source_session_ids": {
                "student_a": challenge.source_session_a_id,
                "student_b": challenge.source_session_b_id,
            },
        }
        await db.commit()
        await db.refresh(challenge)
        logger.info(
            "challenge_preparation_completed challenge_id=%s question_count=%s provider=%s",
            challenge.id, len(generated.questions), generation_provider,
        )
        return challenge
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("challenge_preparation_failed challenge_id=%s", challenge_id)
        try:
            await db.rollback()
            challenge = (
                await db.execute(
                    select(ChallengeSession)
                    .where(ChallengeSession.id == challenge_id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if challenge and challenge.status == "preparing":
                _transition(challenge, "accepted")
                challenge.preparation_started_at = None
                challenge.preparation_error = "Preparation failed. Please try again."
                await db.commit()
        except Exception:
            await db.rollback()
        if isinstance(exc, ChallengePreparationError):
            raise HTTPException(422, str(exc)) from exc
        raise HTTPException(502, "Challenge preparation failed. Please try again.") from exc


async def _expire_if_stale_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> bool:
    now = now_utc()
    changed = False

    if challenge.status in {"pending", "accepted", "waiting"} and challenge.expires_at and now >= challenge.expires_at:
        _transition(challenge, "expired")
        challenge.completed_at = now
        challenge.expires_at = now
        challenge.challenge_metadata = {
            **(challenge.challenge_metadata or {}),
            "expiration_reason": "Challenge invitation/session expired.",
        }
        await _persist_results_locked(challenge, db, incomplete=True)
        changed = True

    elif (
        challenge.status == "preparing"
        and challenge.preparation_started_at
        and now - challenge.preparation_started_at >= PREPARATION_TIMEOUT
    ):
        _transition(challenge, "accepted")
        challenge.preparation_started_at = None
        challenge.preparation_error = "Previous preparation attempt timed out. Retry preparation."
        changed = True

    if challenge.status in {"countdown", "question_active", "waiting_for_opponent", "question_reveal", "next_question"}:
        disconnected_at = challenge.challenger_disconnected_at
        if challenge.opponent_disconnected_at and (
            disconnected_at is None or challenge.opponent_disconnected_at > disconnected_at
        ):
            disconnected_at = challenge.opponent_disconnected_at
        if disconnected_at and now - disconnected_at >= DISCONNECT_GRACE:
            await _expire_active_locked(challenge, db, reason="A participant disconnected for too long.")
            changed = True

    if changed:
        logger.info("challenge_expired_or_recovered challenge_id=%s status=%s", challenge.id, challenge.status)
    return changed


async def _expire_active_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
    *,
    reason: str,
) -> None:
    _transition(challenge, "expired")
    challenge.completed_at = now_utc()
    challenge.expires_at = challenge.completed_at
    challenge.challenge_metadata = {
        **(challenge.challenge_metadata or {}),
        "expiration_reason": reason,
    }
    await _persist_results_locked(challenge, db, incomplete=True)


async def _question_rows(
    challenge_id: int,
    db: AsyncSession,
) -> list[ChallengeQuestion]:
    return list(
        (
            await db.execute(
                select(ChallengeQuestion)
                .where(ChallengeQuestion.challenge_id == challenge_id)
                .order_by(ChallengeQuestion.question_number)
            )
        ).scalars().all()
    )


async def _answers_for_challenge(
    challenge_id: int,
    db: AsyncSession,
) -> list[ChallengeAnswer]:
    return list(
        (
            await db.execute(
                select(ChallengeAnswer)
                .where(ChallengeAnswer.challenge_id == challenge_id)
                .order_by(ChallengeAnswer.answered_at, ChallengeAnswer.id)
            )
        ).scalars().all()
    )


async def _ensure_timeout_answers_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> None:
    if challenge.current_question <= 0:
        return
    questions = await _question_rows(challenge.id, db)
    question = next(
        (q for q in questions if q.question_number == challenge.current_question),
        None,
    )
    if question is None:
        raise HTTPException(409, "Challenge question snapshot is incomplete.")

    existing_rows = list(
        (
            await db.execute(
                select(ChallengeAnswer).where(
                    ChallengeAnswer.challenge_id == challenge.id,
                    ChallengeAnswer.question_id == question.id,
                )
            )
        ).scalars().all()
    )
    existing_users = {row.user_id for row in existing_rows}
    answered_at = challenge.current_question_deadline_at or now_utc()
    for user_id in _participant_ids(challenge):
        if user_id in existing_users:
            continue
        db.add(
            ChallengeAnswer(
                challenge_id=challenge.id,
                question_id=question.id,
                user_id=user_id,
                answer=None,
                is_correct=False,
                answered_at=answered_at,
                response_time_ms=QUESTION_DURATION_SECONDS * 1000,
                timed_out=True,
                evaluation_metadata={"reason": "question_timeout"},
            )
        )


async def _calculate_revealed_scores_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
    *,
    include_current: bool,
) -> list[dict[str, int]]:
    cutoff = challenge.current_question if include_current else max(challenge.current_question - 1, 0)
    if cutoff <= 0:
        return [
            {"userId": user_id, "score": 0, "questionsRevealed": 0, "accuracy": 0}
            for user_id in _participant_ids(challenge)
        ]

    result = await db.execute(
        select(ChallengeAnswer, ChallengeQuestion)
        .join(
            ChallengeQuestion,
            and_(
                ChallengeQuestion.id == ChallengeAnswer.question_id,
                ChallengeQuestion.challenge_id == ChallengeAnswer.challenge_id,
            ),
        )
        .where(
            ChallengeAnswer.challenge_id == challenge.id,
            ChallengeQuestion.question_number <= cutoff,
        )
    )
    rows = result.all()
    per_user: dict[int, list[ChallengeAnswer]] = {uid: [] for uid in _participant_ids(challenge)}
    for answer, _question in rows:
        per_user.setdefault(answer.user_id, []).append(answer)

    snapshots: list[dict[str, int]] = []
    revealed_count = cutoff
    for user_id in _participant_ids(challenge):
        answers = per_user.get(user_id, [])
        score = sum(1 for row in answers if row.is_correct)
        accuracy = round((score / revealed_count) * 100) if revealed_count else 0
        snapshots.append(
            {
                "userId": user_id,
                "score": score,
                "questionsRevealed": revealed_count,
                "accuracy": accuracy,
            }
        )
    return snapshots


async def _reveal_current_question_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> dict[str, Any]:
    await _ensure_timeout_answers_locked(challenge, db)
    questions = await _question_rows(challenge.id, db)
    question = next(
        (q for q in questions if q.question_number == challenge.current_question),
        None,
    )
    if question is None:
        raise HTTPException(409, "Current challenge question is missing.")

    answers = list(
        (
            await db.execute(
                select(ChallengeAnswer).where(
                    ChallengeAnswer.challenge_id == challenge.id,
                    ChallengeAnswer.question_id == question.id,
                    ChallengeAnswer.user_id.in_(list(_participant_ids(challenge))),
                )
            )
        ).scalars().all()
    )
    answer_by_user = {a.user_id: a for a in answers}
    scores = await _calculate_revealed_scores_locked(
        challenge, db, include_current=True
    )
    _transition(challenge, "question_reveal")
    return {
        "challengeId": challenge.id,
        "questionNumber": question.question_number,
        "questionId": question.id,
        "question": question.question,
        "options": question.options,
        "objectiveId": question.objective_id,
        "difficulty": question.difficulty,
        "correctAnswer": question.correct_answer,
        "explanation": question.explanation,
        "answers": [
            {
                "userId": user_id,
                "answer": answer_by_user[user_id].answer,
                "isCorrect": answer_by_user[user_id].is_correct,
                "timedOut": answer_by_user[user_id].timed_out,
                "responseTimeMs": answer_by_user[user_id].response_time_ms,
            }
            for user_id in _participant_ids(challenge)
        ],
        "scores": scores,
        "nextQuestion": challenge.current_question < challenge.question_count,
    }


def build_player_result_snapshot(
    *,
    user_id: int,
    revealed_questions: list[ChallengeQuestion],
    answer_map: dict[tuple[int, int], ChallengeAnswer],
    objective_map: dict[int, LearningObjective],
    incomplete: bool,
) -> dict[str, Any]:
    """Pure scoring/result construction used by both production code and tests."""
    user_answers = [
        (q, answer_map.get((user_id, q.id)))
        for q in revealed_questions
    ]
    score = sum(1 for _q, answer in user_answers if answer and answer.is_correct)
    denominator = len(revealed_questions)
    accuracy = round((score / denominator) * 100) if denominator else 0
    answered_count = sum(
        1
        for _q, answer in user_answers
        if answer and not answer.timed_out and answer.answer is not None
    )

    misses_by_objective: dict[int, dict[str, int]] = {}
    performance: list[dict[str, Any]] = []
    for question, answer in user_answers:
        performance.append(
            {
                "questionId": question.id,
                "questionNumber": question.question_number,
                "objectiveId": question.objective_id,
                "answer": answer.answer if answer else None,
                "isCorrect": bool(answer.is_correct) if answer else False,
                "timedOut": bool(answer.timed_out) if answer else True,
                "responseTimeMs": answer.response_time_ms if answer else None,
                "correctAnswer": question.correct_answer,
                "explanation": question.explanation,
            }
        )
        bucket = misses_by_objective.setdefault(
            question.objective_id, {"missed": 0, "seen": 0}
        )
        if not answer or not answer.is_correct:
            bucket["missed"] += 1
        bucket["seen"] += 1

    weak_areas: list[dict[str, Any]] = []
    for objective_id, counts in sorted(
        misses_by_objective.items(),
        key=lambda item: (item[1]["missed"], item[1]["seen"]),
        reverse=True,
    ):
        if counts["missed"] <= 0:
            continue
        objective = objective_map.get(objective_id)
        weak_areas.append(
            {
                "objectiveId": objective_id,
                "title": objective.title if objective else f"Objective {objective_id}",
                "missed": counts["missed"],
                "seen": counts["seen"],
            }
        )

    if denominator == 0:
        summary = "The battle ended before any question was completed, so no learning result was recorded."
    elif incomplete:
        summary = (
            f"The battle expired after {denominator} revealed question"
            f"{'' if denominator == 1 else 's'}; your score was {score}/{denominator}."
        )
    elif weak_areas:
        summary = (
            f"You scored {score}/{denominator} ({accuracy}%). "
            f"Your most missed objective was {weak_areas[0]['title']}."
        )
    else:
        summary = f"You scored {score}/{denominator} ({accuracy}%) across the battle."

    return {
        "score": score,
        "accuracy": accuracy,
        "questionsAnswered": answered_count,
        "weakAreas": weak_areas,
        "summary": summary,
        "performance": performance,
    }


async def _persist_results_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
    *,
    incomplete: bool,
) -> list[ChallengeResult]:
    """Idempotently persist one result per participant.

    The challenge row is normally held with ``FOR UPDATE`` by callers, so two
    concurrent completion paths serialize here. We nevertheless treat the
    result table as the source of truth: zero, one, or two existing results are
    all valid inputs, and only missing participant rows are inserted.
    """
    existing_rows = list(
        (
            await db.execute(
                select(ChallengeResult).where(
                    ChallengeResult.challenge_id == challenge.id
                )
            )
        ).scalars().all()
    )
    existing_by_user = {row.user_id: row for row in existing_rows}

    participant_ids = _participant_ids(challenge)
    if all(user_id in existing_by_user for user_id in participant_ids):
        return [existing_by_user[user_id] for user_id in participant_ids]

    questions = await _question_rows(challenge.id, db)
    answers = await _answers_for_challenge(challenge.id, db)
    answer_map: dict[tuple[int, int], ChallengeAnswer] = {
        (answer.user_id, answer.question_id): answer for answer in answers
    }

    if incomplete:
        revealed_max = max(challenge.current_question - 1, 0)
        revealed_questions = [q for q in questions if q.question_number <= revealed_max]
    else:
        revealed_questions = questions[:challenge.question_count]

    objective_rows = (
        await db.execute(
            select(LearningObjective).where(
                LearningObjective.id.in_({q.objective_id for q in questions})
            )
        )
    ).scalars().all()
    objective_map = {obj.id: obj for obj in objective_rows}

    newly_created: list[ChallengeResult] = []
    for user_id in participant_ids:
        if user_id in existing_by_user:
            continue
        snapshot = build_player_result_snapshot(
            user_id=user_id,
            revealed_questions=revealed_questions,
            answer_map=answer_map,
            objective_map=objective_map,
            incomplete=incomplete,
        )
        result = ChallengeResult(
            challenge_id=challenge.id,
            user_id=user_id,
            score=snapshot["score"],
            accuracy=snapshot["accuracy"],
            weak_areas=snapshot["weakAreas"],
            summary=snapshot["summary"],
            performance=snapshot["performance"],
        )
        db.add(result)
        newly_created.append(result)
        existing_by_user[user_id] = result

    await db.flush()

    # A completed battle is practice evidence. Route it through the existing
    # progress service so Challenge does not create a competing progress model.
    # Only newly-created results increment sessions_completed.
    if not incomplete and newly_created:
        completion_time = challenge.completed_at or now_utc()
        for result in newly_created:
            await progress_service.record_challenge_practice(
                db,
                user_id=result.user_id,
                topic_id=challenge.topic_id,
                accuracy=result.accuracy,
                completed_at=completion_time,
            )

    return [existing_by_user[user_id] for user_id in participant_ids]


async def _post_completion_learning_effects(
    challenge_id: int,
    db: AsyncSession,
) -> None:
    # Results are already committed. These observation writes are independent
    # and intentionally do not touch the student-reported profile fields.
    result_rows = (
        await db.execute(
            select(ChallengeResult).where(
                ChallengeResult.challenge_id == challenge_id
            )
        )
    ).scalars().all()
    if not result_rows:
        return

    questions = await _question_rows(challenge_id, db)
    objective_rows = (
        await db.execute(
            select(LearningObjective).where(
                LearningObjective.id.in_({q.objective_id for q in questions})
            )
        )
    ).scalars().all()
    objective_map = {row.id: row for row in objective_rows}

    # A completed battle is also a normal learning activity for the existing
    # streak/badge system. ``record_activity`` is idempotent for same-day
    # repeats, and badge evaluation itself is duplicate-safe.
    for result in result_rows:
        try:
            await progress_service.record_activity(db, result.user_id)
            await progress_service.evaluate_badges(db, result.user_id)
        except Exception as exc:
            logger.warning(
                "challenge_progress_activity_failed challenge_id=%s user_id=%s error=%s",
                challenge_id, result.user_id, exc,
            )

    for result in result_rows:
        observations: list[dict] = []
        for weak in result.weak_areas[:4]:
            objective = objective_map.get(weak["objectiveId"])
            title = objective.title if objective else weak["title"]
            confidence = min(0.9, 0.62 + 0.08 * max(0, weak["missed"] - 1))
            observations.append(
                {
                    "type": "learning_observation",
                    "category": "challenge_performance",
                    "observation": (
                        f"During AI Quiz Battle practice, the student missed "
                        f"{weak['missed']} of {weak['seen']} questions mapped to "
                        f"'{title}'."
                    ),
                    "confidence": confidence,
                    "source": "challenge",
                    "challenge_id": challenge_id,
                }
            )
        if result.accuracy >= 85:
            observations.append(
                {
                    "type": "learning_observation",
                    "category": "challenge_performance",
                    "observation": (
                        f"Student demonstrated strong performance in an AI Quiz Battle "
                        f"with {result.accuracy}% accuracy on a shared concept."
                    ),
                    "confidence": 0.72,
                    "source": "challenge",
                    "challenge_id": challenge_id,
                }
            )
        try:
            await lp_svc.append_observations_bulk(result.user_id, observations, db)
        except Exception as exc:
            logger.warning(
                "challenge_learning_observations_failed challenge_id=%s user_id=%s error=%s",
                challenge_id, result.user_id, exc,
            )


async def _advance_timers_locked(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> tuple[list[dict[str, Any]], bool]:
    events: list[dict[str, Any]] = []
    changed = await _expire_if_stale_locked(challenge, db)

    if challenge.status == "expired":
        return [
            {
                "type": "challenge_expired",
                "data": {
                    "challengeId": challenge.id,
                    "reason": (challenge.challenge_metadata or {}).get("expiration_reason")
                    or challenge.preparation_error
                    or "Challenge expired.",
                },
            }
        ], True

    now = now_utc()

    # Keep looping because a very late reconnect can move through more than one
    # timestamped state in a single authoritative transaction.
    for _ in range(4):
        if challenge.status == "countdown" and challenge.countdown_started_at:
            if now >= challenge.countdown_started_at + timedelta(seconds=COUNTDOWN_SECONDS):
                challenge.started_at = challenge.countdown_started_at + timedelta(seconds=COUNTDOWN_SECONDS)
                challenge.current_question = 1
                question_start = challenge.started_at
                challenge.current_question_started_at = question_start
                challenge.current_question_deadline_at = question_start + timedelta(seconds=QUESTION_DURATION_SECONDS)
                challenge.expires_at = challenge.started_at + BATTLE_TTL
                _transition(challenge, "question_active")
                events.append(
                    {
                        "type": "question_started",
                        "data": await _public_question_started_event(challenge, db),
                    }
                )
                changed = True
                now = now_utc()
                continue

        if (
            challenge.status in {"question_active", "waiting_for_opponent"}
            and challenge.current_question_deadline_at
            and now >= challenge.current_question_deadline_at
        ):
            reveal = await _reveal_current_question_locked(challenge, db)
            events.append({"type": "question_reveal", "data": reveal})
            changed = True
            continue

        if challenge.status == "question_reveal" and challenge.current_question_started_at:
            reveal_started_at = (
                challenge.current_question_deadline_at
                or challenge.current_question_started_at
                or now
            )
            # Reveal is measured from the moment the reveal state begins. We
            # record that moment in challenge_metadata to avoid another column.
            reveal_started_iso = (challenge.challenge_metadata or {}).get("revealStartedAt")
            if reveal_started_iso:
                try:
                    reveal_started = datetime.fromisoformat(reveal_started_iso)
                except ValueError:
                    reveal_started = now
            else:
                reveal_started = now
                challenge.challenge_metadata = {
                    **(challenge.challenge_metadata or {}),
                    "revealStartedAt": reveal_started.isoformat(),
                }
                changed = True

            if now >= reveal_started + timedelta(seconds=REVEAL_SECONDS):
                if challenge.current_question >= challenge.question_count:
                    _transition(challenge, "completed")
                    challenge.completed_at = now
                    challenge.expires_at = now
                    results = await _persist_results_locked(challenge, db, incomplete=False)
                    events.append(
                        {
                            "type": "challenge_completed",
                            "data": {
                                "challengeId": challenge.id,
                                "scores": [
                                    {
                                        "userId": r.user_id,
                                        "score": r.score,
                                        "accuracy": r.accuracy,
                                    }
                                    for r in results
                                ],
                            },
                        }
                    )
                else:
                    _transition(challenge, "next_question")
                    challenge.current_question += 1
                    events.append(
                        {
                            "type": "next_question",
                            "data": {
                                "challengeId": challenge.id,
                                "questionNumber": challenge.current_question,
                            },
                        }
                    )
                    question_start = now
                    challenge.current_question_started_at = question_start
                    challenge.current_question_deadline_at = question_start + timedelta(seconds=QUESTION_DURATION_SECONDS)
                    challenge.challenge_metadata = {
                        **(challenge.challenge_metadata or {}),
                        "revealStartedAt": None,
                    }
                    _transition(challenge, "question_active")
                    events.append(
                        {
                            "type": "question_started",
                            "data": await _public_question_started_event(challenge, db),
                        }
                    )
                changed = True
                now = now_utc()
                continue
        break

    return events, changed


async def _public_question_started_event(
    challenge: ChallengeSession,
    db: AsyncSession,
) -> dict[str, Any]:
    questions = await _question_rows(challenge.id, db)
    question = next(
        (q for q in questions if q.question_number == challenge.current_question),
        None,
    )
    if not question:
        raise HTTPException(409, "Current challenge question is missing.")
    return {
        "challengeId": challenge.id,
        "questionNumber": question.question_number,
        "questionId": question.id,
        "question": question.question,
        "options": question.options,
        "objectiveId": question.objective_id,
        "difficulty": question.difficulty,
        "startedAt": _iso(challenge.current_question_started_at),
        "deadlineAt": _iso(challenge.current_question_deadline_at),
    }


async def _post_completion_learning_effects_fresh(challenge_id: int) -> None:
    """Run post-battle profile observations in a separate transaction."""
    if SessionLocal is None:
        return
    async with SessionLocal() as effect_db:
        await _post_completion_learning_effects(challenge_id, effect_db)


async def advance_challenge_timers(
    challenge_id: int,
    db: AsyncSession,
) -> tuple[list[dict[str, Any]], bool]:
    challenge = (
        await db.execute(
            select(ChallengeSession)
            .where(ChallengeSession.id == challenge_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not challenge:
        return [], False

    events, changed = await _advance_timers_locked(challenge, db)
    if changed:
        await db.commit()
        await db.refresh(challenge)
    else:
        await db.rollback()

    if any(event["type"] == "challenge_completed" for event in events):
        try:
            await _post_completion_learning_effects_fresh(challenge_id)
        except Exception:
            logger.exception("challenge_completion_observation_effects_failed challenge_id=%s", challenge_id)

    return events, changed


async def mark_ready(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> tuple[ChallengeSession, bool]:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    stale_changed = await _expire_if_stale_locked(challenge, db)

    if challenge.status not in {"waiting", "countdown"}:
        if stale_changed:
            await db.commit()
            await db.refresh(challenge)
        if challenge.status in {"question_active", "waiting_for_opponent", "question_reveal", "completed"}:
            return challenge, False
        raise HTTPException(409, f"Challenge is '{challenge.status}' and cannot be started.")

    now = now_utc()
    if challenge.challenge_mode == "ai":
        challenge.challenger_ready = True
        challenge.challenger_ready_at = challenge.challenger_ready_at or now
        challenge.opponent_ready = True
        challenge.opponent_ready_at = challenge.opponent_ready_at or now
    elif challenge.challenger_id == user_id:
        challenge.challenger_ready = True
        challenge.challenger_ready_at = challenge.challenger_ready_at or now
    else:
        challenge.opponent_ready = True
        challenge.opponent_ready_at = challenge.opponent_ready_at or now

    started_countdown = False
    if challenge.challenger_ready and challenge.opponent_ready and challenge.status == "waiting":
        _transition(challenge, "countdown")
        challenge.countdown_started_at = now
        challenge.expires_at = now + BATTLE_TTL
        started_countdown = True
        logger.info("challenge_countdown_started challenge_id=%s mode=%s", challenge.id, challenge.challenge_mode)

    await db.commit()
    await db.refresh(challenge)
    return challenge, started_countdown


async def submit_answer(
    challenge_id: int,
    user_id: int,
    question_id: int,
    answer: str,
    db: AsyncSession,
) -> tuple[dict[str, Any], Optional[dict[str, Any]]]:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    timer_events, timer_changed = await _advance_timers_locked(challenge, db)
    timer_terminal = any(
        event["type"] in {"question_reveal", "challenge_completed", "challenge_expired"}
        for event in timer_events
    )
    if timer_changed and timer_events:
        # A timer transition may simply have moved countdown -> active. Only a
        # reveal/completion/expiry makes the submitted answer too late.
        await db.commit()
        if any(event["type"] == "challenge_completed" for event in timer_events):
            await _post_completion_learning_effects(challenge.id, db)
        if timer_terminal:
            raise HTTPException(409, "The question deadline has passed or the challenge has moved on.")

    if challenge.status not in {"question_active", "waiting_for_opponent"}:
        raise HTTPException(409, "This challenge is not accepting answers right now.")

    current_question = (
        await db.execute(
            select(ChallengeQuestion).where(
                ChallengeQuestion.challenge_id == challenge.id,
                ChallengeQuestion.id == question_id,
            )
        )
    ).scalar_one_or_none()
    if current_question is None:
        raise HTTPException(404, "Question not found in this challenge.")
    if current_question.question_number != challenge.current_question:
        raise HTTPException(409, "That question is no longer active.")
    if not challenge.current_question_started_at or not challenge.current_question_deadline_at:
        raise HTTPException(409, "Question timing is not active.")

    existing = (
        await db.execute(
            select(ChallengeAnswer)
            .where(
                ChallengeAnswer.challenge_id == challenge.id,
                ChallengeAnswer.question_id == question_id,
                ChallengeAnswer.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "You have already submitted an answer for this question.")

    received_at = now_utc()
    if received_at >= challenge.current_question_deadline_at:
        reveal = await _reveal_current_question_locked(challenge, db)
        await db.commit()
        # Caller can broadcast the reveal event; no answer was accepted.
        return {
            "challengeId": challenge.id,
            "questionId": question_id,
            "status": "waiting_for_opponent",
            "message": "The answer window has closed.",
        }, {"type": "question_reveal", "data": reveal}

    normalized = answer.strip().upper()
    if normalized not in {"A", "B", "C", "D"}:
        raise HTTPException(422, "answer must be one of A, B, C, or D.")
    if normalized not in current_question.options:
        raise HTTPException(422, "That answer option is not available for this question.")

    response_time_ms = max(
        0,
        int((received_at - challenge.current_question_started_at).total_seconds() * 1000),
    )
    answer_row = ChallengeAnswer(
        challenge_id=challenge.id,
        question_id=question_id,
        user_id=user_id,
        answer=normalized,
        is_correct=(normalized == current_question.correct_answer),
        answered_at=received_at,
        response_time_ms=response_time_ms,
        timed_out=False,
        evaluation_metadata={"grading": "server_authoritative"},
    )
    db.add(answer_row)
    await db.flush()

    other_user_id = (
        challenge.opponent_id
        if user_id == challenge.challenger_id
        else challenge.challenger_id
    )
    other_answer = (
        await db.execute(
            select(ChallengeAnswer)
            .where(
                ChallengeAnswer.challenge_id == challenge.id,
                ChallengeAnswer.question_id == question_id,
                ChallengeAnswer.user_id == other_user_id,
            )
        )
    ).scalar_one_or_none()

    reveal_event: Optional[dict[str, Any]] = None
    if other_answer:
        reveal_event = await _reveal_current_question_locked(challenge, db)
        challenge.challenge_metadata = {
            **(challenge.challenge_metadata or {}),
            "revealStartedAt": now_utc().isoformat(),
        }
    else:
        _transition(challenge, "waiting_for_opponent")

    await db.commit()

    ack = {
        "challengeId": challenge.id,
        "questionId": question_id,
        "status": "submitted",
        "message": (
            "Answer submitted. The result will be revealed when both players have answered."
        ),
    }
    if reveal_event:
        logger.info("challenge_question_revealed challenge_id=%s question_id=%s", challenge.id, question_id)
        return ack, {"type": "question_reveal", "data": reveal_event}

    return ack, {
        "type": "answer_submitted",
        "data": {
            "challengeId": challenge.id,
            "questionNumber": challenge.current_question,
        },
    }


async def mark_connected(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> tuple[ChallengeSession, bool]:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    previous_disconnect = (
        challenge.challenger_disconnected_at
        if user_id == challenge.challenger_id
        else challenge.opponent_disconnected_at
    )
    if user_id == challenge.challenger_id:
        challenge.challenger_disconnected_at = None
    else:
        challenge.opponent_disconnected_at = None
    await db.commit()
    await db.refresh(challenge)
    return challenge, previous_disconnect is not None


async def mark_disconnected(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
    *,
    currently_connected_elsewhere: bool = False,
) -> ChallengeSession:
    challenge = await _get_participant_locked(challenge_id, user_id, db)
    if currently_connected_elsewhere:
        return challenge
    active_statuses = {
        "countdown", "question_active", "waiting_for_opponent",
        "question_reveal", "next_question",
    }
    if challenge.status not in active_statuses:
        return challenge
    timestamp = now_utc()
    if user_id == challenge.challenger_id:
        challenge.challenger_disconnected_at = timestamp
    else:
        challenge.opponent_disconnected_at = timestamp
    await db.commit()
    await db.refresh(challenge)
    logger.info(
        "challenge_disconnected challenge_id=%s user_id=%s",
        challenge.id, user_id,
    )
    return challenge


async def get_challenge_state_for_runtime(
    challenge_id: int,
    db: AsyncSession,
) -> dict[str, Any] | None:
    """Minimal non-advancing state used by the background runtime scheduler."""
    challenge = (
        await db.execute(select(ChallengeSession).where(ChallengeSession.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        return None
    return {
        "status": challenge.status,
        "countdownStartedAt": _iso(challenge.countdown_started_at),
        "questionDeadlineAt": _iso(challenge.current_question_deadline_at),
        "revealStartedAt": (challenge.challenge_metadata or {}).get("revealStartedAt"),
    }


def build_current_question_payload(
    question: ChallengeQuestion,
    viewer_answer: Optional[ChallengeAnswer],
    *,
    reveal: bool = False,
    reveal_answers: Optional[list[ChallengeAnswer]] = None,
) -> dict[str, Any]:
    """Build a participant-safe question payload; correctness only appears on reveal."""
    payload: dict[str, Any] = {
        "id": question.id,
        "questionNumber": question.question_number,
        "objectiveId": question.objective_id,
        "question": question.question,
        "options": question.options,
        "difficulty": question.difficulty,
        "hasSubmitted": viewer_answer is not None,
    }
    if not reveal:
        return payload
    payload.update({
        "answer": viewer_answer.answer if viewer_answer else None,
        "isCorrect": viewer_answer.is_correct if viewer_answer else False,
        "timedOut": viewer_answer.timed_out if viewer_answer else True,
        "responseTimeMs": viewer_answer.response_time_ms if viewer_answer else None,
        "correctAnswer": question.correct_answer,
        "explanation": question.explanation,
        "revealAnswers": [
            {
                "userId": answer.user_id,
                "answer": answer.answer,
                "isCorrect": answer.is_correct,
                "timedOut": answer.timed_out,
                "responseTimeMs": answer.response_time_ms,
            }
            for answer in (reveal_answers or [])
        ],
    })
    return payload


async def get_challenge_state(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> dict[str, Any]:
    # Authorization must happen before any state-changing timer reconciliation.
    challenge = (
        await db.execute(select(ChallengeSession).where(ChallengeSession.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found.")
    _role(challenge, user_id)

    events, _changed = await advance_challenge_timers(challenge_id, db)
    # Any state transitions above are authoritative; now load a clean snapshot.
    challenge = (
        await db.execute(select(ChallengeSession).where(ChallengeSession.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found.")
    role = _role(challenge, user_id)

    subject, topic, concept = await _load_curriculum(challenge, db)
    user_ids = {challenge.challenger_id}
    if challenge.opponent_id is not None:
        user_ids.add(challenge.opponent_id)
    users = await _load_users(user_ids, db)
    opponent = None
    if challenge.challenge_mode == "peer" and challenge.opponent_id is not None:
        opponent = users[challenge.opponent_id if role == "challenger" else challenge.challenger_id]

    include_current = challenge.status == "question_reveal"
    if challenge.status in {"completed", "expired"}:
        include_current = challenge.status == "completed"
    score_snapshots = await _calculate_revealed_scores_locked(challenge, db, include_current=include_current)

    current_data = None
    if challenge.status in {"question_active", "waiting_for_opponent", "question_reveal"}:
        questions = await _question_rows(challenge.id, db)
        question = next(
            (q for q in questions if q.question_number == challenge.current_question),
            None,
        )
        if question:
            viewer_answer = (
                await db.execute(
                    select(ChallengeAnswer).where(
                        ChallengeAnswer.challenge_id == challenge.id,
                        ChallengeAnswer.question_id == question.id,
                        ChallengeAnswer.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()
            all_answers = []
            if challenge.status == "question_reveal":
                all_answers = (
                    await db.execute(
                        select(ChallengeAnswer).where(
                            ChallengeAnswer.challenge_id == challenge.id,
                            ChallengeAnswer.question_id == question.id,
                            ChallengeAnswer.user_id.in_(list(_participant_ids(challenge))),
                        )
                    )
                ).scalars().all()
            current_data = build_current_question_payload(
                question,
                viewer_answer,
                reveal=challenge.status == "question_reveal",
                reveal_answers=all_answers,
            )

    waiting_reason = None
    if challenge.status == "pending":
        waiting_reason = "Waiting for the opponent to accept the challenge."
    elif challenge.status == "accepted":
        waiting_reason = "Challenge accepted. It is ready to prepare."
    elif challenge.status == "preparing":
        waiting_reason = "Building the battle from both students' learned content."
    elif challenge.status == "waiting":
        waiting_reason = "Both students must ready up before the battle starts."
    elif challenge.status == "countdown":
        waiting_reason = "Both students are ready. The battle is starting."
    elif challenge.status == "waiting_for_opponent":
        waiting_reason = "Answer submitted. Waiting for the opponent."
    elif challenge.status == "question_reveal":
        waiting_reason = "Question result revealed."
    elif challenge.status == "completed":
        waiting_reason = "Battle complete."
    elif challenge.status == "expired":
        waiting_reason = (challenge.challenge_metadata or {}).get("expiration_reason") or "Battle expired."

    return {
        "id": challenge.id,
        "role": role,
        "mode": challenge.challenge_mode,
        "status": challenge.status,
        "subjectId": subject.id,
        "topicId": topic.id,
        "conceptId": concept.id,
        "subjectName": subject.name,
        "topicName": topic.name,
        "conceptName": concept.name,
        "questionCount": challenge.question_count,
        "currentQuestion": challenge.current_question,
        "createdAt": challenge.created_at.isoformat(),
        "acceptedAt": _iso(challenge.accepted_at),
        "startedAt": _iso(challenge.started_at),
        "expiresAt": _iso(challenge.expires_at),
        "countdownStartedAt": _iso(challenge.countdown_started_at),
        "questionStartedAt": _iso(challenge.current_question_started_at),
        "questionDeadlineAt": _iso(challenge.current_question_deadline_at),
        "ready": (
            challenge.challenger_ready
            if role == "challenger"
            else challenge.opponent_ready
        ),
        "opponentReady": (
            challenge.opponent_ready
            if role == "challenger"
            else challenge.challenger_ready
        ),
        "opponent": ({
            "id": opponent.id,
            "displayName": opponent.full_name or "PeerUP student",
            "photoURL": opponent.photo_url or "",
            "isOnline": bool(opponent.is_online),
        } if opponent is not None else None),
        "currentQuestionData": current_data,
        "scores": score_snapshots,
        "waitingReason": waiting_reason,
        "preparationError": challenge.preparation_error,
    }


async def list_challenges(
    user_id: int,
    db: AsyncSession,
    *,
    limit: int = 30,
) -> dict[str, Any]:
    limit = max(1, min(limit, LIST_LIMIT_MAX))

    # Lazy expiration keeps history truthful even when no background worker is
    # running. Active battle timing is still handled by row-locked advancement.
    stale = list(
        (
            await db.execute(
                select(ChallengeSession)
                .where(
                    or_(
                        ChallengeSession.challenger_id == user_id,
                        ChallengeSession.opponent_id == user_id,
                    ),
                    ChallengeSession.status.in_({"pending", "accepted", "waiting"}),
                    ChallengeSession.expires_at.is_not(None),
                    ChallengeSession.expires_at <= now_utc(),
                )
                .with_for_update()
            )
        ).scalars().all()
    )
    if stale:
        for stale_row in stale:
            _transition(stale_row, "expired")
            expired_at = now_utc()
            stale_row.completed_at = expired_at
            stale_row.expires_at = expired_at
            stale_row.challenge_metadata = {
                **(stale_row.challenge_metadata or {}),
                "expiration_reason": "Challenge expired before it advanced.",
            }
            await _persist_results_locked(stale_row, db, incomplete=True)
        await db.commit()

    rows = list(
        (
            await db.execute(
                select(ChallengeSession)
                .where(
                    or_(
                        ChallengeSession.challenger_id == user_id,
                        ChallengeSession.opponent_id == user_id,
                    )
                )
                .order_by(ChallengeSession.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
    )
    user_ids = {user_id}
    concept_ids = set()
    subject_ids = set()
    for row in rows:
        user_ids.add(row.challenger_id)
        if row.opponent_id is not None:
            user_ids.add(row.opponent_id)
        concept_ids.add(row.concept_id)
        subject_ids.add(row.subject_id)
    users = await _load_users(user_ids, db)
    concepts = {
        c.id: c
        for c in (
            await db.execute(select(Concept).where(Concept.id.in_(concept_ids)))
        ).scalars().all()
    }
    subjects = {
        s.id: s
        for s in (
            await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))
        ).scalars().all()
    }

    items = []
    for row in rows:
        role = _role(row, user_id)
        opponent_id = row.opponent_id if role == "challenger" else row.challenger_id
        opponent = users.get(opponent_id) if opponent_id is not None else None
        concept = concepts.get(row.concept_id)
        subject = subjects.get(row.subject_id)
        if not concept or not subject:
            continue
        items.append(
            {
                "id": row.id,
                "role": role,
                "mode": row.challenge_mode,
                "status": row.status,
                "conceptId": row.concept_id,
                "conceptName": concept.name,
                "subjectName": subject.name,
                "opponent": ({
                    "id": opponent.id,
                    "displayName": opponent.full_name or "PeerUP student",
                    "photoURL": opponent.photo_url or "",
                    "isOnline": bool(opponent.is_online),
                } if opponent is not None else None),
                "questionCount": row.question_count,
                "currentQuestion": row.current_question,
                "createdAt": row.created_at.isoformat(),
                "completedAt": _iso(row.completed_at),
            }
        )
    return {"items": items, "total": len(items)}


async def get_results(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> dict[str, Any]:
    challenge = (
        await db.execute(select(ChallengeSession).where(ChallengeSession.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found.")
    _role(challenge, user_id)

    if challenge.status not in {"completed", "expired"}:
        raise HTTPException(409, "Results are available only after the battle finishes or expires.")

    rows = list(
        (
            await db.execute(
                select(ChallengeResult).where(
                    ChallengeResult.challenge_id == challenge.id
                )
            )
        ).scalars().all()
    )
    own = next((row for row in rows if row.user_id == user_id), None)
    opponent = next((row for row in rows if row.user_id != user_id), None)
    if own is None:
        raise HTTPException(409, "Final results are not ready yet.")
    if challenge.challenge_mode == "peer" and opponent is None:
        raise HTTPException(409, "Final results are not ready yet.")

    opponent_answered = (
        len([p for p in opponent.performance if not p.get("timedOut") and p.get("answer") is not None])
        if opponent is not None else 0
    )

    return {
        "challengeId": challenge.id,
        "status": challenge.status,
        "score": own.score,
        "accuracy": own.accuracy,
        "questionsAnswered": sum(
            1 for p in own.performance
            if not p.get("timedOut") and p.get("answer") is not None
        ),
        "totalQuestions": (
            len(own.performance)
            if own.performance
            else challenge.question_count
        ),
        "weakAreas": own.weak_areas or [],
        "summary": own.summary,
        "opponent": ({
            "userId": opponent.user_id,
            "score": opponent.score,
            "accuracy": opponent.accuracy,
            "questionsAnswered": opponent_answered,
            "totalQuestions": len(opponent.performance),
        } if opponent is not None else None),
        "perQuestion": own.performance,
        "completedAt": _iso(challenge.completed_at),
    }


async def get_review(
    challenge_id: int,
    user_id: int,
    db: AsyncSession,
) -> dict[str, Any]:
    challenge = (
        await db.execute(select(ChallengeSession).where(ChallengeSession.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found.")
    _role(challenge, user_id)
    if challenge.status not in {"completed", "expired"}:
        raise HTTPException(409, "Challenge review is available after the battle finishes or expires.")

    questions = await _question_rows(challenge.id, db)
    answers = await _answers_for_challenge(challenge.id, db)
    by_question: dict[int, list[ChallengeAnswer]] = {}
    for answer in answers:
        by_question.setdefault(answer.question_id, []).append(answer)

    rows = list(
        (
            await db.execute(
                select(ChallengeResult).where(
                    ChallengeResult.challenge_id == challenge.id
                )
            )
        ).scalars().all()
    )
    if len(rows) < (2 if challenge.challenge_mode == "peer" else 1):
        raise HTTPException(409, "Challenge results are not ready yet.")

    return {
        "challengeId": challenge.id,
        "status": challenge.status,
        "questions": [
            {
                "id": question.id,
                "questionNumber": question.question_number,
                "objectiveId": question.objective_id,
                "question": question.question,
                "options": question.options,
                "correctAnswer": question.correct_answer,
                "explanation": question.explanation,
                "difficulty": question.difficulty,
                "answers": [
                    {
                        "userId": answer.user_id,
                        "answer": answer.answer,
                        "isCorrect": answer.is_correct,
                        "timedOut": answer.timed_out,
                        "responseTimeMs": answer.response_time_ms,
                    }
                    for answer in by_question.get(question.id, [])
                ],
            }
            for question in questions
        ],
        "finalScores": [
            {
                "userId": row.user_id,
                "score": row.score,
                "accuracy": row.accuracy,
                "questionsAnswered": sum(
                    1 for performance in row.performance
                    if not performance.get("timedOut")
                    and performance.get("answer") is not None
                ),
                "totalQuestions": len(row.performance),
            }
            for row in rows
        ],
    }
