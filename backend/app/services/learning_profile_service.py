"""Learning Profile service — Knovi.

Handles CRUD for ai_learning_profiles and the append-only AI observation
accumulation that builds up over real learning sessions.

Design notes
────────────
* One profile row per user.  Created lazily on first access (get_or_create).
* Student-reported fields are editable by the user at any time.
* ai_observations is an append-only JSONB list; individual observations are
  never deleted — they accumulate as evidence over sessions.
* Only observations with confidence > 0.5 are stored (low-signal noise is
  discarded before it reaches the database).
* The AI prompt-context builder (_build_learner_context) returns a concise
  text block that is injected into the teaching/evaluation prompts.
  It prioritises subject-relevant observations over generic ones.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning_profile import AILearningProfile

logger = logging.getLogger(__name__)

# Only store observations above this confidence threshold.
_MIN_CONFIDENCE = 0.50

# Maximum observations kept per profile (oldest pruned beyond this limit).
_MAX_OBSERVATIONS = 200

# Maximum observations included in a single AI prompt context.
_MAX_CONTEXT_OBSERVATIONS = 8


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def _get_or_create(user_id: int, db: AsyncSession) -> AILearningProfile:
    """Return the user's profile row, creating an empty one if it doesn't exist."""
    result = await db.execute(
        select(AILearningProfile).where(AILearningProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = AILearningProfile(
            user_id=user_id,
            strengths=[],
            struggles=[],
            learning_preferences=[],
            learning_behavior=[],
            ai_observations=[],
        )
        db.add(profile)
        await db.flush()
        await db.commit()
        await db.refresh(profile)
    return profile


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC SERVICE FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

async def get_profile(user_id: int, db: AsyncSession) -> AILearningProfile:
    """Return (or lazily create) the learning profile for this user."""
    return await _get_or_create(user_id, db)


async def upsert_profile(
    user_id: int,
    strengths: list[str],
    struggles: list[str],
    learning_preferences: list[str],
    learning_behavior: list[str],
    personal_note: str,
    db: AsyncSession,
) -> AILearningProfile:
    """Save student-reported learning profile fields.  Never touches ai_observations."""
    profile = await _get_or_create(user_id, db)

    profile.strengths            = strengths
    profile.struggles            = struggles
    profile.learning_preferences = learning_preferences
    profile.learning_behavior    = learning_behavior
    profile.personal_note        = personal_note.strip() or None

    await db.commit()
    await db.refresh(profile)
    return profile


async def append_observation(
    user_id: int,
    observation: dict,
    db: AsyncSession,
) -> None:
    """
    Append a single AI observation to the user's profile.

    Silently discards observations below the confidence threshold.
    Prunes the oldest entries if the list exceeds _MAX_OBSERVATIONS.
    """
    confidence = observation.get("confidence", 0.0)
    if confidence < _MIN_CONFIDENCE:
        logger.debug(
            "Observation for user %d discarded (confidence %.2f < %.2f)",
            user_id, confidence, _MIN_CONFIDENCE,
        )
        return

    profile = await _get_or_create(user_id, db)

    # Stamp the observation with the current time if not already present.
    if not observation.get("created_at"):
        observation = {**observation, "created_at": _now_iso()}

    current: list[dict] = list(profile.ai_observations or [])
    current.append(observation)

    # Prune oldest to cap storage.
    if len(current) > _MAX_OBSERVATIONS:
        current = current[-_MAX_OBSERVATIONS:]

    profile.ai_observations = current
    await db.commit()


async def append_observations_bulk(
    user_id: int,
    observations: list[dict],
    db: AsyncSession,
) -> None:
    """Append multiple observations in a single DB round-trip."""
    if not observations:
        return

    filtered = [
        {**obs, "created_at": obs.get("created_at") or _now_iso()}
        for obs in observations
        if obs.get("confidence", 0.0) >= _MIN_CONFIDENCE
    ]
    if not filtered:
        return

    profile = await _get_or_create(user_id, db)
    current: list[dict] = list(profile.ai_observations or [])
    current.extend(filtered)

    if len(current) > _MAX_OBSERVATIONS:
        current = current[-_MAX_OBSERVATIONS:]

    profile.ai_observations = current
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT CONTEXT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def build_learner_context(
    profile: Optional[AILearningProfile],
    subject_name: Optional[str] = None,
    concept_id: Optional[int] = None,
    topic_id: Optional[int] = None,
) -> str:
    """
    Build the LEARNER PROFILE section that is injected into AI prompts.

    Keeps the context concise:
    - Lists student-reported preferences (if any are set).
    - Surfaces concept-specific misconceptions at the top when concept_id matches,
      so the tutor can address them directly in this session.
    - Includes up to _MAX_CONTEXT_OBSERVATIONS relevant observations,
      prioritising those whose observation text mentions the current subject.
    - Returns an empty string when the profile is None or completely empty,
      so prompts are not cluttered for brand-new users.
    """
    if profile is None:
        return ""

    lines: list[str] = []

    # ── Student-reported section ──────────────────────────────────────────
    reported: list[str] = []

    if profile.strengths:
        reported.append(f"  Strengths: {', '.join(profile.strengths)}")
    if profile.struggles:
        reported.append(f"  Struggles: {', '.join(profile.struggles)}")
    if profile.learning_preferences:
        reported.append(f"  Learns best via: {', '.join(profile.learning_preferences)}")
    if profile.learning_behavior:
        reported.append(f"  When stuck: {', '.join(profile.learning_behavior)}")
    if profile.personal_note:
        reported.append(f"  Student's own note: \"{profile.personal_note}\"")

    if reported:
        lines.append("STUDENT LEARNING PROFILE (self-reported)")
        lines.extend(reported)

    # ── Concept mastery map (teacher memory) ─────────────────────────────
    mastery = get_concept_mastery(profile, concept_id) if concept_id is not None else None
    if mastery:
        lines.append("CONCEPT MASTERY MAP (from previous sessions on this concept)")
        lines.append(f"  Mastery level: {mastery.get('mastery_level', 'unknown')}")
        lines.append(f"  Last studied: {mastery.get('last_studied', 'unknown')}")
        lines.append(f"  Suggested review date: {mastery.get('review_date', 'soon')}")
        if mastery.get("strong_on"):
            lines.append(f"  Strong on: {', '.join(mastery['strong_on'])}")
        if mastery.get("weak_on"):
            lines.append(f"  Weak on: {', '.join(mastery['weak_on'])}")
        if mastery.get("known_misconceptions"):
            lines.append(f"  Known misconceptions: {', '.join(mastery['known_misconceptions'])}")
        lines.append("  Open by briefly recalling a weak area before teaching anything new.")

    # ── AI-observed section ───────────────────────────────────────────────
    observations: list[dict] = list(profile.ai_observations or [])
    if observations:
        # ── Concept-specific misconceptions (highest priority) ────────────
        # Surface these at the top so the tutor addresses them directly this
        # session, rather than having them buried in a generic flat list.
        if concept_id is not None:
            concept_misconceptions = [
                obs for obs in observations
                if obs.get("category") == "misconception"
                and obs.get("concept_id") == concept_id
            ]
            if concept_misconceptions:
                lines.append("\nKNOWN MISCONCEPTIONS FOR THIS CONCEPT (address these directly):")
                for obs in concept_misconceptions[-3:]:  # most recent 3
                    lines.append(f"  ⚠ {obs.get('observation', '')}")

        # ── General observations (subject-prioritised) ────────────────────
        subject_lower = (subject_name or "").lower()

        # Exclude already-shown concept misconceptions from the general list
        shown_concept_misc_texts = set()
        if concept_id is not None:
            shown_concept_misc_texts = {
                obs.get("observation", "")
                for obs in observations
                if obs.get("category") == "misconception"
                and obs.get("concept_id") == concept_id
            }

        def _relevance_key(obs: dict) -> tuple:
            text = (obs.get("observation") or "").lower()
            subject_match = subject_lower and subject_lower in text
            return (not subject_match, )  # True sorts after False → subject matches first

        general_obs = [
            obs for obs in observations
            if obs.get("observation", "") not in shown_concept_misc_texts
        ]
        sorted_obs = sorted(general_obs, key=_relevance_key)
        top_obs = sorted_obs[:_MAX_CONTEXT_OBSERVATIONS]

        if top_obs:
            lines.append("\nAI-OBSERVED LEARNING TENDENCIES (from past sessions)")
            lines.append(
                "  (These are patterns observed across sessions — not diagnoses. "
                "Confidence reflects the strength of evidence.)"
            )
            for obs in top_obs:
                cat        = obs.get("category", "observation")
                text       = obs.get("observation", "")
                conf       = obs.get("confidence", 0.0)
                strategy   = obs.get("strategy")
                conf_label = "high" if conf >= 0.8 else "moderate" if conf >= 0.65 else "tentative"
                entry = f"  [{cat}, {conf_label} evidence] {text}"
                if strategy:
                    entry += f" (strategy: {strategy})"
                lines.append(entry)

    if not lines:
        return ""

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# CONCEPT MASTERY MAP (persistent teacher memory per concept)
# ─────────────────────────────────────────────────────────────────────────────

async def upsert_concept_mastery(
    user_id: int,
    *,
    concept_id: int,
    concept_name: str,
    mastery_level: str,
    known_misconceptions: list[str] | None = None,
    strong_on: list[str] | None = None,
    weak_on: list[str] | None = None,
    review_after_days: int = 1,
    db: AsyncSession,
) -> None:
    """Store/replace a structured concept-level mastery snapshot for this user.

    Stored inside ai_observations as type=concept_mastery so no schema migration
    is required. Older entries for the same concept_id are replaced.
    """
    from datetime import datetime, timezone, timedelta

    profile = await _get_or_create(user_id, db)
    current: list[dict] = list(profile.ai_observations or [])
    current = [
        o for o in current
        if not (o.get("type") == "concept_mastery" and int(o.get("concept_id") or 0) == int(concept_id))
    ]
    review_at = (datetime.now(timezone.utc) + timedelta(days=max(0, int(review_after_days)))).date().isoformat()
    current.append({
        "type": "concept_mastery",
        "concept_id": int(concept_id),
        "concept_name": concept_name,
        "mastery_level": mastery_level,
        "known_misconceptions": list(known_misconceptions or [])[:6],
        "strong_on": list(strong_on or [])[:6],
        "weak_on": list(weak_on or [])[:6],
        "last_studied": datetime.now(timezone.utc).date().isoformat(),
        "review_after_days": int(review_after_days),
        "review_date": review_at,
        "confidence": 0.95,
        "created_at": _now_iso(),
    })
    if len(current) > _MAX_OBSERVATIONS:
        current = current[-_MAX_OBSERVATIONS:]
    profile.ai_observations = current
    await db.commit()


def get_concept_mastery(profile: Optional[AILearningProfile], concept_id: int) -> Optional[dict]:
    if profile is None:
        return None
    for o in reversed(list(profile.ai_observations or [])):
        if o.get("type") == "concept_mastery" and int(o.get("concept_id") or 0) == int(concept_id):
            return o
    return None
