"""Learning-overlap peer discovery service for PeerUP.

This module answers: "Which other students are learning similar things to the
current user, and how strong is that overlap?"

Design principles
─────────────────
* Deterministic — no LLM involvement. Overlap is computed from real DB rows.
* Efficient — SQL does the heavy lifting. Python only scores small result sets
  after the database has already filtered to relevant candidates.
* Safe — only exposes safe metadata (concept/topic/subject names, recency
  status). Never exposes AI message content, teaching snapshots, answers, or
  any private learning material.
* Architecture-consistent — "connected" means a Conversation row exists,
  matching the existing challenge_service._is_connected() contract.

Overlap scoring
───────────────
  Same concept (any eligible status)            →  50 pts
  + session updated within RECENCY_RECENT_DAYS  → +15 pts  (active/recent)
  + session updated within RECENCY_OLD_DAYS     →  +5 pts  (still fresh)

  Same topic only (no shared concept)           →  20 pts
  Same subject only (no shared topic/concept)   →   5 pts

Only the single strongest overlap between two users is returned (concept >
topic > subject).

A session is "eligible" for matching when:
  - status NOT IN ('abandoned', 'created')
  - at least one AISessionTeaching row exists  (real content was taught)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_learning import AILearningSession, AISessionTeaching
from app.models.chat import Conversation
from app.models.curriculum import Concept, Subject, Topic
from app.models.user import User
from app.services.challenge_ai_service import select_relevant_session, load_challenge_context, ChallengePreparationError


# ── Scoring constants ─────────────────────────────────────────────────────────

SCORE_CONCEPT: int = 50
SCORE_TOPIC: int = 20
SCORE_SUBJECT: int = 5
SCORE_RECENCY_RECENT: int = 15   # bonus if session touched within RECENT window
SCORE_RECENCY_FRESH: int = 5     # smaller bonus within FRESH window

RECENCY_RECENT_DAYS: int = 7
RECENCY_FRESH_DAYS: int = 30

# Sessions with these statuses are considered ineligible for peer matching.
INELIGIBLE_STATUSES = frozenset({"abandoned", "created"})

# Maximum candidates returned from the DB before Python scoring.
_MAX_CANDIDATES: int = 200

# Maximum learning peers returned in a single response.
MAX_LEARNING_PEERS: int = 20


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Data shapes ───────────────────────────────────────────────────────────────

class LearningOverlap:
    """Represents the computed overlap between the current user and one peer."""

    __slots__ = (
        "type",
        "score",
        "subject_id", "subject_name",
        "topic_id", "topic_name",
        "concept_id", "concept_name",
        "reason",
        "is_active",
    )

    def __init__(
        self,
        *,
        overlap_type: str,         # "concept" | "topic" | "subject"
        score: int,
        subject_id: int,
        subject_name: str,
        topic_id: int,
        topic_name: str,
        concept_id: Optional[int],
        concept_name: Optional[str],
        reason: str,
        is_active: bool,
    ) -> None:
        self.type = overlap_type
        self.score = score
        self.subject_id = subject_id
        self.subject_name = subject_name
        self.topic_id = topic_id
        self.topic_name = topic_name
        self.concept_id = concept_id
        self.concept_name = concept_name
        self.reason = reason
        self.is_active = is_active

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "score": self.score,
            "subjectId": self.subject_id,
            "subjectName": self.subject_name,
            "topicId": self.topic_id,
            "topicName": self.topic_name,
            "conceptId": self.concept_id,
            "conceptName": self.concept_name,
            "reason": self.reason,
            "isActive": self.is_active,
        }


# ── Internal session row shape ────────────────────────────────────────────────

class _SessionRow:
    """Lightweight container for one ai_learning_sessions row used in overlap."""
    __slots__ = (
        "user_id", "concept_id", "topic_id", "subject_id",
        "status", "updated_at", "completed_at",
        "concept_name", "topic_name", "subject_name",
    )

    def __init__(self, **kw: object) -> None:
        for k, v in kw.items():
            setattr(self, k, v)


# ── Recency helper ────────────────────────────────────────────────────────────

def _recency_bonus(updated_at: Optional[datetime], completed_at: Optional[datetime]) -> int:
    """Return a recency score bonus based on when the session was last active."""
    now = _utcnow()
    # Use whichever timestamp indicates the most recent activity.
    ts = max(
        (t for t in (updated_at, completed_at) if t is not None),
        default=None,
    )
    if ts is None:
        return 0
    # Normalise to UTC-aware datetime if needed.
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age = now - ts
    if age <= timedelta(days=RECENCY_RECENT_DAYS):
        return SCORE_RECENCY_RECENT
    if age <= timedelta(days=RECENCY_FRESH_DAYS):
        return SCORE_RECENCY_FRESH
    return 0


def _is_active_session(updated_at: Optional[datetime], completed_at: Optional[datetime]) -> bool:
    """True when the session was last touched within the RECENT window."""
    ts = max(
        (t for t in (updated_at, completed_at) if t is not None),
        default=None,
    )
    if ts is None:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (_utcnow() - ts) <= timedelta(days=RECENCY_RECENT_DAYS)


# ── Step 1: fetch current user's eligible concept/topic/subject IDs ───────────

async def _get_my_session_rows(
    user_id: int,
    db: AsyncSession,
) -> list[_SessionRow]:
    """
    Fetch the current user's eligible sessions that have real teaching content.

    We join against ai_session_teaching so we only return sessions where the
    AI actually produced content — matching the select_relevant_session() logic
    in challenge_ai_service.
    """
    rows = (
        await db.execute(
            select(
                AILearningSession.concept_id,
                AILearningSession.topic_id,
                AILearningSession.subject_id,
                AILearningSession.status,
                AILearningSession.updated_at,
                AILearningSession.completed_at,
            )
            .join(
                AISessionTeaching,
                AISessionTeaching.session_id == AILearningSession.id,
            )
            .where(
                AILearningSession.user_id == user_id,
                AILearningSession.status.not_in(INELIGIBLE_STATUSES),
            )
            .distinct()
        )
    ).all()

    return [
        _SessionRow(
            user_id=user_id,
            concept_id=r.concept_id,
            topic_id=r.topic_id,
            subject_id=r.subject_id,
            status=r.status,
            updated_at=r.updated_at,
            completed_at=r.completed_at,
            concept_name=None,
            topic_name=None,
            subject_name=None,
        )
        for r in rows
    ]


# ── Step 2: fetch matching peer sessions ──────────────────────────────────────

async def _get_peer_session_rows(
    candidate_user_ids: list[int],
    my_concept_ids: list[int],
    my_topic_ids: list[int],
    my_subject_ids: list[int],
    db: AsyncSession,
) -> list[_SessionRow]:
    """
    Fetch sessions from candidates that overlap on concept, topic, or subject.
    Uses the partial indexes created in migration 003.
    Only returns sessions that have real teaching content.
    """
    if not candidate_user_ids:
        return []

    # We use ANY(:array) which PostgreSQL can use the partial indexes for.
    rows = (
        await db.execute(
            select(
                AILearningSession.user_id,
                AILearningSession.concept_id,
                AILearningSession.topic_id,
                AILearningSession.subject_id,
                AILearningSession.status,
                AILearningSession.updated_at,
                AILearningSession.completed_at,
                Concept.name.label("concept_name"),
                Topic.name.label("topic_name"),
                Subject.name.label("subject_name"),
            )
            .join(Concept, Concept.id == AILearningSession.concept_id)
            .join(Topic, Topic.id == AILearningSession.topic_id)
            .join(Subject, Subject.id == AILearningSession.subject_id)
            .join(
                AISessionTeaching,
                AISessionTeaching.session_id == AILearningSession.id,
            )
            .where(
                AILearningSession.user_id.in_(candidate_user_ids),
                AILearningSession.status.not_in(INELIGIBLE_STATUSES),
                or_(
                    AILearningSession.concept_id.in_(my_concept_ids) if my_concept_ids else text("FALSE"),
                    AILearningSession.topic_id.in_(my_topic_ids) if my_topic_ids else text("FALSE"),
                    AILearningSession.subject_id.in_(my_subject_ids) if my_subject_ids else text("FALSE"),
                ),
            )
            .distinct(
                AILearningSession.user_id,
                AILearningSession.concept_id,
                AILearningSession.topic_id,
                AILearningSession.subject_id,
            )
            .limit(_MAX_CANDIDATES)
        )
    ).all()

    return [
        _SessionRow(
            user_id=r.user_id,
            concept_id=r.concept_id,
            topic_id=r.topic_id,
            subject_id=r.subject_id,
            status=r.status,
            updated_at=r.updated_at,
            completed_at=r.completed_at,
            concept_name=r.concept_name,
            topic_name=r.topic_name,
            subject_name=r.subject_name,
        )
        for r in rows
    ]


# ── Step 3: score one peer against current user's sessions ───────────────────

def _score_peer(
    my_rows: list[_SessionRow],
    peer_rows: list[_SessionRow],
) -> Optional[LearningOverlap]:
    """
    Compute the strongest learning overlap between the current user and one peer.

    Returns None when there is no meaningful overlap.
    Concept match always beats topic, topic always beats subject.
    Within the same type, prefer the most recently active session.
    """
    my_concepts = {r.concept_id for r in my_rows}
    my_topics   = {r.topic_id   for r in my_rows}
    my_subjects = {r.subject_id for r in my_rows}

    best: Optional[LearningOverlap] = None
    best_score: int = -1

    for pr in peer_rows:
        # ── Concept overlap ───────────────────────────────────────────────
        if pr.concept_id in my_concepts:
            recency = _recency_bonus(pr.updated_at, pr.completed_at)
            score = SCORE_CONCEPT + recency
            active = _is_active_session(pr.updated_at, pr.completed_at)

            if score > best_score:
                best_score = score
                activity_label = "learning now" if active else "learning"
                best = LearningOverlap(
                    overlap_type="concept",
                    score=score,
                    subject_id=pr.subject_id,
                    subject_name=pr.subject_name or "",
                    topic_id=pr.topic_id,
                    topic_name=pr.topic_name or "",
                    concept_id=pr.concept_id,
                    concept_name=pr.concept_name or "",
                    reason=f"You're both {activity_label} {pr.concept_name}",
                    is_active=active,
                )
            continue  # concept > topic > subject; skip weaker checks for this row

        # ── Topic overlap ─────────────────────────────────────────────────
        if pr.topic_id in my_topics:
            recency = _recency_bonus(pr.updated_at, pr.completed_at)
            score = SCORE_TOPIC + recency
            active = _is_active_session(pr.updated_at, pr.completed_at)

            if score > best_score:
                best_score = score
                best = LearningOverlap(
                    overlap_type="topic",
                    score=score,
                    subject_id=pr.subject_id,
                    subject_name=pr.subject_name or "",
                    topic_id=pr.topic_id,
                    topic_name=pr.topic_name or "",
                    concept_id=None,
                    concept_name=None,
                    reason=f"You're both studying {pr.topic_name}",
                    is_active=active,
                )
            continue

        # ── Subject overlap ───────────────────────────────────────────────
        if pr.subject_id in my_subjects:
            recency = _recency_bonus(pr.updated_at, pr.completed_at)
            score = SCORE_SUBJECT + recency
            active = _is_active_session(pr.updated_at, pr.completed_at)

            if score > best_score:
                best_score = score
                best = LearningOverlap(
                    overlap_type="subject",
                    score=score,
                    subject_id=pr.subject_id,
                    subject_name=pr.subject_name or "",
                    topic_id=pr.topic_id,
                    topic_name=pr.topic_name or "",
                    concept_id=None,
                    concept_name=None,
                    reason=f"You're both learning {pr.subject_name}",
                    is_active=active,
                )

    return best


# ── Step 4: fetch which candidates have a Conversation with current user ───────

async def _get_conversation_partners(
    user_id: int,
    candidate_ids: list[int],
    db: AsyncSession,
) -> set[int]:
    """
    Return the set of candidate IDs that already have a Conversation with the
    current user. This mirrors _is_connected() in challenge_service but is
    batched for efficiency.
    """
    if not candidate_ids:
        return set()

    rows = (
        await db.execute(
            select(Conversation.user_a_id, Conversation.user_b_id)
            .where(
                or_(
                    and_(
                        Conversation.user_a_id == user_id,
                        Conversation.user_b_id.in_(candidate_ids),
                    ),
                    and_(
                        Conversation.user_b_id == user_id,
                        Conversation.user_a_id.in_(candidate_ids),
                    ),
                )
            )
        )
    ).all()

    connected: set[int] = set()
    for r in rows:
        partner = r.user_b_id if r.user_a_id == user_id else r.user_a_id
        connected.add(partner)
    return connected


# ── Step 5: challenge eligibility hint ───────────────────────────────────────

async def _check_challenge_eligible(
    user_id: int,
    peer_id: int,
    concept_id: Optional[int],
    db: AsyncSession,
) -> bool:
    """
    Return True only when both users have an eligible AI learning session for
    the shared concept (with actual teaching content).

    This mirrors select_relevant_session() from challenge_ai_service but avoids
    loading full ORM relationships — we just need to know a qualifying session exists.

    NOTE: This is a *hint* only. The authoritative check is still performed by
    challenge_service.create_challenge() when the battle is actually created.
    We never promise that a challenge will succeed just because this returns True.
    """
    if concept_id is None:
        return False

    # Reuse the exact session-selection and objective validation used by
    # Challenge creation. This endpoint is deliberately conservative: if the
    # authoritative challenge context cannot be built, discovery says false.
    session_a = await select_relevant_session(user_id, concept_id, db)
    session_b = await select_relevant_session(peer_id, concept_id, db)
    if not session_a or not session_b:
        return False

    # Load the exact curriculum objects expected by load_challenge_context.
    # The IDs come from the shared discovery overlap, but we still verify the
    # hierarchy and active state so a stale session can never advertise a
    # challenge that create_challenge would reject.
    subject = (
        await db.execute(
            select(Subject).where(
                Subject.id == session_a.subject_id,
                Subject.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    topic = (
        await db.execute(
            select(Topic)
            .options(selectinload(Topic.learning_objectives))
            .where(Topic.id == session_a.topic_id)
        )
    ).scalar_one_or_none()
    concept = (
        await db.execute(select(Concept).where(Concept.id == concept_id))
    ).scalar_one_or_none()
    if not subject or not topic or not concept or not topic.is_active:
        return False
    if topic.subject_id != subject.id or concept.topic_id != topic.id:
        return False
    if session_a.subject_id != subject.id or session_a.topic_id != topic.id:
        return False
    if session_b.subject_id != subject.id or session_b.topic_id != topic.id:
        return False

    # load_challenge_context is the same objective-intersection gate used by
    # ChallengeService.create_challenge(). It also relies only on persisted
    # teaching objective_ids, not the planned learning tasks.
    try:
        await load_challenge_context(
            challenger_id=user_id,
            opponent_id=peer_id,
            subject=subject,
            topic=topic,
            concept=concept,
            session_a=session_a,
            session_b=session_b,
        )
    except ChallengePreparationError:
        return False
    return True


# ── Public API ────────────────────────────────────────────────────────────────

async def discover_learning_peers(
    *,
    current_user_id: int,
    candidates: list[User],
    db: AsyncSession,
    include_weak_overlap: bool = False,
) -> list[dict]:
    """
    Compute learning overlap for every candidate user and return enriched
    discovery results, sorted by overlap score (strongest first).

    Parameters
    ──────────
    current_user_id    — The authenticated student.
    candidates         — Profile-complete users (already excludes self).
    db                 — Async SQLAlchemy session.
    include_weak_overlap — If True, subject-level overlaps (score < SCORE_TOPIC)
                           are also included. Defaults to False (concept + topic only).

    Returns
    ───────
    A list of flat, backward-compatible peer dicts containing the normal user
    fields plus relationship, learningOverlap, and challengeEligible.
    Ordered by overlap score desc, then online status, then name.
    """
    if not candidates:
        return []

    candidate_ids = [u.id for u in candidates]
    candidate_map = {u.id: u for u in candidates}

    # Fetch current user's eligible sessions.
    my_rows = await _get_my_session_rows(current_user_id, db)

    if not my_rows:
        # No learning activity yet — return candidates without overlap data.
        connected = await _get_conversation_partners(current_user_id, candidate_ids, db)
        return [
            {
                **candidate_map[uid].serialize(),
                "relationship": "conversation" if uid in connected else "none",
                "learningOverlap": None,
                "challengeEligible": False,
            }
            for uid in candidate_ids
        ]

    my_concept_ids  = list({r.concept_id  for r in my_rows})
    my_topic_ids    = list({r.topic_id    for r in my_rows})
    my_subject_ids  = list({r.subject_id  for r in my_rows})

    # Fetch candidate sessions that share any concept/topic/subject.
    peer_rows_all = await _get_peer_session_rows(
        candidate_user_ids=candidate_ids,
        my_concept_ids=my_concept_ids,
        my_topic_ids=my_topic_ids,
        my_subject_ids=my_subject_ids,
        db=db,
    )

    # Group peer rows by user_id.
    peer_rows_by_user: dict[int, list[_SessionRow]] = {}
    for pr in peer_rows_all:
        peer_rows_by_user.setdefault(pr.user_id, []).append(pr)

    # Fetch conversation partners (batched, not per-user).
    connected = await _get_conversation_partners(current_user_id, candidate_ids, db)

    # Score each candidate.
    scored: list[tuple[int, Optional[LearningOverlap]]] = []
    for uid in candidate_ids:
        overlap = _score_peer(my_rows, peer_rows_by_user.get(uid, []))
        scored.append((uid, overlap))

    # Subject overlap is intentionally the weakest supported signal, but it is
    # still a real learning overlap. Ranking keeps concept > topic > subject.
    # include_weak_overlap remains for compatibility with older callers.
    min_score = SCORE_SUBJECT
    filtered = [(uid, ov) for uid, ov in scored if ov is not None and ov.score >= min_score]

    # Resolve challenge eligibility for concept-level matches where a conversation exists.
    results = []
    for uid, overlap in filtered:
        is_connected = uid in connected
        challenge_eligible = False

        if is_connected and overlap is not None and overlap.type == "concept" and overlap.concept_id is not None:
            challenge_eligible = await _check_challenge_eligible(
                current_user_id, uid, overlap.concept_id, db
            )

        results.append({
            **candidate_map[uid].serialize(),
            "relationship": "conversation" if is_connected else "none",
            "learningOverlap": overlap.to_dict() if overlap else None,
            "challengeEligible": challenge_eligible,
        })

    # Sort: score desc → active first → online → name
    results.sort(
        key=lambda r: (
            -(r["learningOverlap"]["score"] if r["learningOverlap"] else 0),
            -(1 if r["learningOverlap"] and r["learningOverlap"]["isActive"] else 0),
            -(1 if r["isOnline"] else 0),
            (r.get("displayName") or "").lower(),
        )
    )

    return results[:MAX_LEARNING_PEERS]


async def enrich_discover_users(
    *,
    current_user_id: int,
    candidates: list[User],
    db: AsyncSession,
) -> list[dict]:
    """
    Lightweight enrichment for the general Discover view.

    Unlike discover_learning_peers(), this always returns all candidates but
    adds relationship and a (potentially None) learningOverlap to each. The
    response remains flat so existing student.uid/displayName consumers continue
    to work unchanged.
    Used by GET /api/users/discover (existing general view).
    """
    if not candidates:
        return []

    candidate_ids = [u.id for u in candidates]
    candidate_map = {u.id: u for u in candidates}

    my_rows = await _get_my_session_rows(current_user_id, db)
    connected = await _get_conversation_partners(current_user_id, candidate_ids, db)

    peer_rows_by_user: dict[int, list[_SessionRow]] = {}
    if my_rows:
        my_concept_ids  = list({r.concept_id  for r in my_rows})
        my_topic_ids    = list({r.topic_id    for r in my_rows})
        my_subject_ids  = list({r.subject_id  for r in my_rows})
        peer_rows_all = await _get_peer_session_rows(
            candidate_user_ids=candidate_ids,
            my_concept_ids=my_concept_ids,
            my_topic_ids=my_topic_ids,
            my_subject_ids=my_subject_ids,
            db=db,
        )
        for pr in peer_rows_all:
            peer_rows_by_user.setdefault(pr.user_id, []).append(pr)

    results = []
    for uid in candidate_ids:
        overlap = _score_peer(my_rows, peer_rows_by_user.get(uid, [])) if my_rows else None
        is_connected = uid in connected

        challenge_eligible = False
        if is_connected and overlap is not None and overlap.type == "concept" and overlap.concept_id is not None:
            challenge_eligible = await _check_challenge_eligible(
                current_user_id, uid, overlap.concept_id, db
            )

        results.append({
            **candidate_map[uid].serialize(),
            "relationship": "conversation" if is_connected else "none",
            "learningOverlap": overlap.to_dict() if overlap else None,
            "challengeEligible": challenge_eligible,
        })

    return results
