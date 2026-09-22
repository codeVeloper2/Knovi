"""AI Learning Session service for PeerUP.

Architecture: curriculum (WHAT) + Gemini (HOW) + persisted teaching content.
user_id always from auth dependency. subject->topic->concept chain validated.

Fixes applied (v2):
  - Server-authoritative timer with early-finish rejection
  - Explanation hiding during retrieval/practice states
  - Attempt-number bug fixed (result consumed only once)
  - Best-per-question scoring (not raw average)
  - Intent system wired into AI prompts
  - Adaptive reteach SQLAlchemy row access fixed
  - TeachingAttempt outcome populated after evaluation
  - complete_session guarded against trivial completion
  - State machine: teaching→completed blocked
  - Structured EvaluationOut returned from submit_answer
  - Messages endpoint + safe message filtering
"""
from __future__ import annotations

import logging
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_learning import (
    AILearningSession, AISessionAnswer, AISessionIntegrityEvent,
    AISessionMessage, AISessionQuestion, AISessionStudyPeriod,
    AISessionSummary, AISessionTeaching, AISessionTeachingAttempt,
)
from app.models.curriculum import Concept, LearningObjective, Misconception, Subject, Topic
from app.models.learning_profile import AILearningProfile
from app.services.ai_service import call_with_fallback, parse_json
from app.services import learning_profile_service as lp_svc
from app.services import progress_service

logger = logging.getLogger(__name__)

# ── Teaching strategy rotation ────────────────────────────────────────────────
_STRATEGY_ROTATION = [
    "technical_explanation",
    "simple_explanation",
    "analogy",
    "real_world_example",
    "worked_example",
    "step_by_step",
    "comparison",
    "story_context",
    "visual_description",
    "misconception_correction",
    "socratic_questioning",
]

# ── Intent → initial strategy hint ───────────────────────────────────────────
_INTENT_STRATEGY_HINT: dict[str, str] = {
    "teach_me":       "technical_explanation",
    "already_know":   "socratic_questioning",
    "explain_simply": "simple_explanation",
    "give_examples":  "real_world_example",
    "broaden":        "comparison",
    "go_deeper":      "technical_explanation",
    "quiz_me":        "socratic_questioning",
    "custom":         "technical_explanation",
}

# ── Intent → prompt modifier ──────────────────────────────────────────────────
_INTENT_PROMPT_MODIFIER: dict[str, str] = {
    "teach_me":
        "Teach this concept comprehensively from first principles.",
    "already_know":
        "The student claims familiarity. Skip basic definitions. Use Socratic questions "
        "to probe and confirm real understanding. Highlight subtleties and edge cases.",
    "explain_simply":
        "Explain with the simplest possible language. Avoid jargon. Use short sentences "
        "and concrete everyday comparisons. Assume no prior knowledge.",
    "give_examples":
        "Lead with 3–4 concrete, varied examples before explaining the theory. "
        "Make examples relatable and progressively more complex.",
    "broaden":
        "Connect this concept to related topics in the subject. Show how it fits into "
        "the bigger picture. Mention real-world applications and adjacent ideas.",
    "go_deeper":
        "Go beyond the basics. Include technical depth, edge cases, underlying mechanisms, "
        "and implications. Assume the student can handle complexity.",
    "quiz_me":
        "Begin immediately with a diagnostic question to assess current understanding. "
        "Ask before explaining. Use the student's response to tailor the explanation.",
    "custom":
        "Follow the student's specific request while staying within the curriculum concept.",
}

# ── Valid state transitions ───────────────────────────────────────────────────
# teaching→completed is REMOVED to prevent bypassing retrieval.
# complete_session has its own guard requiring retrieval/practice first.
_VALID_TRANSITIONS: dict[str, set[str]] = {
    "created":    {"teaching", "abandoned"},
    "teaching":   {"studying", "retrieval", "reteaching", "abandoned"},
    "studying":   {"retrieval", "abandoned"},
    "retrieval":  {"reteaching", "practice", "completed", "abandoned"},
    "reteaching": {"studying", "retrieval", "practice", "teaching", "completed", "abandoned"},
    "practice":   {"teaching", "retrieval", "completed", "abandoned"},
    "completed":  set(),
    "abandoned":  set(),
    "paused":     {"teaching", "studying", "retrieval", "reteaching", "practice", "abandoned"},
}

# States where teaching content must be hidden from student-facing APIs
_PROTECTED_STATES = {"retrieval", "practice"}

_CHAT_HISTORY_WINDOW = 12

# Minimum time fraction before early finish is accepted (server-side).
# Student must wait at least 20% of allocated time before finishing early.
# After 100% elapsed the server always accepts.
_EARLY_FINISH_MIN_FRACTION = 0.20

# Short uncertainty responses are legitimate retrieval evidence. Treat them
# deterministically as insufficient evidence so an "I don't know" answer can
# never be mistaken for a successful retrieval because of model ambiguity.
_UNCERTAINTY_RESPONSE_RE = re.compile(
    r"^(?:i\s+(?:don['’]?t|do not)\s+know(?:\s+(?:yet|the\s+answer))?|"
    r"i(?:['’]m|\s+am)\s+(?:not\s+sure|unsure)|"
    r"i\s+have\s+no\s+idea|"
    r"not\s+sure|\?+)$",
    re.IGNORECASE,
)

_READINESS_CONFIRMATION_RE = re.compile(
    r"^(?:yes|yeah|yep|sure|ready|i(?:'|\s*)m ready|let['’]?s do it|go ahead|okay|ok|absolutely|sounds good)[.!\s]*$",
    re.IGNORECASE,
)
_READINESS_SIGNAL_RE = re.compile(
    r"\b(?:ready for a quick check|ready for a quick practice|quick check|ready to test|check your understanding)\b",
    re.IGNORECASE,
)
_UNDERSTANDING_SIGNAL_RE = re.compile(
    r"\b(?:i (?:now )?(?:understand|get it)|that makes sense|i get it|got it|i understand now)\b",
    re.IGNORECASE,
)


def _is_uncertainty_response(answer: str) -> bool:
    normalized = re.sub(r"\s+", " ", (answer or "").strip())
    return bool(normalized and _UNCERTAINTY_RESPONSE_RE.fullmatch(normalized))


def _filter_protected_messages(messages: list) -> list:
    """Return the full conversation with teaching content safely locked.

    Practice is a protected state: the learner must not be able to read the
    original teaching text, but the conversation itself must remain intact.
    We therefore replace teaching/reteach content with a persisted-state
    placeholder rather than removing the messages.
    """
    result = []
    for message in sorted(messages, key=lambda item: item.sequence):
        if message.message_type in ("teaching", "reteach"):
            data = message.serialize()
            data["content"] = "🔒 Currently in practice mode.\nTeaching content will reopen after practice mode."
            data["extra"] = {**(data.get("extra") or {}), "locked": True, "originalMessageId": message.id}
            result.append(data)
        else:
            result.append(message.serialize())
    return result


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _set_status(session: AILearningSession, new_status: str) -> None:
    """Enforce state machine. Raises 409 on invalid transition."""
    current = session.status
    allowed = _VALID_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise HTTPException(
            409,
            f"Cannot transition session from '{current}' to '{new_status}'."
        )
    session.status = new_status


def _begin_adaptive_reteach(session: AILearningSession) -> None:
    """Enter the reteaching stage without ever performing reteaching→reteaching.

    Answer evaluation already moves a failed retrieval into ``reteaching``.
    The reteach endpoint may therefore be called while the session is already
    in that state.  Direct reteach requests from teaching/practice/retrieval
    still enter the state through the normal transition validator.
    """
    if session.status != "reteaching":
        _set_status(session, "reteaching")


def _finish_adaptive_reteach(session: AILearningSession) -> None:
    """Return to normal conversation after adaptive reteaching.

    Reteaching is conversation content, not a quiz screen. The next practice
    cycle starts only after the tutor asks readiness again and the learner
    confirms.
    """
    if session.status != "reteaching":
        raise HTTPException(
            409,
            f"Cannot finish reteaching: session is '{session.status}'."
        )
    _set_status(session, "teaching")


def _safe_list(v: Any) -> list:
    return v if isinstance(v, list) else []


def _safe_str(v: Any, fallback: str = "") -> str:
    return v.strip() if isinstance(v, str) and v.strip() else fallback


def _safe_int(v: Any, lo: int = 0, hi: int = 100) -> Optional[int]:
    if isinstance(v, (int, float)):
        return max(lo, min(hi, int(v)))
    return None


# ── Session ownership loader ──────────────────────────────────────────────────
async def _get_session_owned(
    session_id: int,
    user_id: int,
    db: AsyncSession,
    *,
    load_messages: bool = False,
    load_teaching: bool = False,
    load_questions: bool = False,
    load_summary: bool = False,
    load_attempts: bool = False,
    load_study_periods: bool = False,
) -> AILearningSession:
    opts = []
    if load_messages:      opts.append(selectinload(AILearningSession.messages))
    if load_teaching:      opts.append(selectinload(AILearningSession.teaching))
    if load_questions:     opts.append(selectinload(AILearningSession.questions))
    if load_summary:       opts.append(selectinload(AILearningSession.summary))
    if load_attempts:      opts.append(selectinload(AILearningSession.teaching_attempts))
    if load_study_periods: opts.append(selectinload(AILearningSession.study_periods))

    stmt = select(AILearningSession).where(AILearningSession.id == session_id)
    if opts:
        stmt = stmt.options(*opts)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Learning session not found.")
    if session.user_id != user_id:
        raise HTTPException(403, "Access denied.")
    return session


# ── Message sequence helper ───────────────────────────────────────────────────
async def _next_sequence(session_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(AISessionMessage.sequence)
        .where(AISessionMessage.session_id == session_id)
        .order_by(AISessionMessage.sequence.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    return (last or 0) + 1


async def _add_message(
    session_id: int,
    role: str,
    message_type: str,
    content: str,
    db: AsyncSession,
    *,
    extra: Optional[dict] = None,
) -> AISessionMessage:
    seq = await _next_sequence(session_id, db)
    msg = AISessionMessage(
        session_id=session_id,
        role=role,
        message_type=message_type,
        content=content,
        sequence=seq,
        extra=extra,
    )
    db.add(msg)
    await db.flush()
    return msg


# ── Teaching snapshot helpers ─────────────────────────────────────────────────
async def _get_current_teaching(session_id: int, db: AsyncSession) -> Optional[AISessionTeaching]:
    result = await db.execute(
        select(AISessionTeaching).where(
            AISessionTeaching.session_id == session_id,
            AISessionTeaching.is_current == True,
        )
    )
    return result.scalar_one_or_none()


async def _retire_current_teaching(session_id: int, db: AsyncSession) -> None:
    await db.execute(
        update(AISessionTeaching)
        .where(
            AISessionTeaching.session_id == session_id,
            AISessionTeaching.is_current == True,
        )
        .values(is_current=False)
    )


# ── Curriculum chain loader ───────────────────────────────────────────────────
async def _load_curriculum_chain(
    subject_id: int,
    topic_id: int,
    concept_id: int,
    db: AsyncSession,
) -> tuple[Subject, Topic, Concept]:
    subj = (await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.is_active == True)
    )).scalar_one_or_none()
    if not subj:
        raise HTTPException(404, f"Subject {subject_id} not found or inactive.")

    topic = (await db.execute(
        select(Topic)
        .options(selectinload(Topic.learning_objectives), selectinload(Topic.misconceptions))
        .where(Topic.id == topic_id)
    )).scalar_one_or_none()
    if not topic:
        raise HTTPException(404, f"Topic {topic_id} not found.")
    if topic.subject_id != subject_id:
        raise HTTPException(422, f"Topic {topic_id} does not belong to subject {subject_id}.")

    concept = (await db.execute(
        select(Concept)
        .options(selectinload(Concept.misconceptions))
        .where(Concept.id == concept_id)
    )).scalar_one_or_none()
    if not concept:
        raise HTTPException(404, f"Concept {concept_id} not found.")
    if concept.topic_id != topic_id:
        raise HTTPException(422, f"Concept {concept_id} does not belong to topic {topic_id}.")

    return subj, topic, concept


# ── Curriculum context builder ────────────────────────────────────────────────
def _build_curriculum_context(
    subject: Subject,
    topic: Topic,
    concept: Concept,
    session: AILearningSession,
    learner_profile: Optional["AILearningProfile"] = None,
) -> str:
    objectives = "\n".join(
        f"  {i+1}. [{lo.id}] {lo.title}: {lo.description}"
        for i, lo in enumerate(topic.learning_objectives or [])
    ) or "  (none)"

    # Prefer concept-level misconceptions; fall back to topic-level
    concept_misc = getattr(concept, "misconceptions", None) or []
    topic_misc   = getattr(topic,   "misconceptions", None) or []
    all_misc     = concept_misc or topic_misc
    misconceptions = "\n".join(
        f"  - {m.misconception}\n    Correction: {m.correction}"
        for m in all_misc
    ) or "  (none)"

    key_points = "\n".join(
        f"  - {kp}" for kp in (concept.key_points or [])
    ) or "  (none)"

    intent_note = _INTENT_PROMPT_MODIFIER.get(session.intent, "")

    # Build the learner profile section (empty string if no profile / empty profile)
    learner_ctx = lp_svc.build_learner_context(learner_profile, subject_name=subject.name)
    learner_section = f"\n\n{learner_ctx}" if learner_ctx else ""

    return (
        f"CURRICULUM CONTEXT\n"
        f"Subject: {subject.name}\n"
        f"Topic: {topic.name} (difficulty: {topic.difficulty or 'unspecified'})\n"
        f"Topic description: {topic.description or '(none)'}\n"
        f"Concept: {concept.name}\n"
        f"Concept explanation:\n{concept.explanation}\n\n"
        f"Key points:\n{key_points}\n\n"
        f"Learning objectives:\n{objectives}\n\n"
        f"Known misconceptions:\n{misconceptions}\n\n"
        f"STUDENT CONTEXT\n"
        f"Familiarity: {session.student_familiarity}\n"
        f"Intent: {session.intent}\n"
        f"Student note: {session.student_note or '(none)'}\n"
        f"Custom intent text: {session.custom_intent_text or '(none)'}\n\n"
        f"TEACHING DIRECTIVE\n{intent_note}"
        f"{learner_section}"
    )


def _pick_next_strategy(used_strategies: list[str], intent: str) -> str:
    """Choose the next unused strategy. Seed from intent on first attempt."""
    if not used_strategies:
        return _INTENT_STRATEGY_HINT.get(intent, "technical_explanation")
    used_set = set(used_strategies)
    for s in _STRATEGY_ROTATION:
        if s not in used_set:
            return s
    # All used — restart rotation from index 1 (skip technical_explanation if used)
    return _STRATEGY_ROTATION[1]


# ── Scoring: best-per-question ────────────────────────────────────────────────
def _compute_session_score(all_answers: list[AISessionAnswer]) -> tuple[int, int, Optional[int]]:
    """
    Returns (questions_answered, questions_correct, overall_score_0_100).

    Scoring rule:
      For each unique question, take the BEST score across all attempts.
      A question is 'correct' if best score >= 70.
      overall_score = mean of best scores.

    This prevents multiple failed attempts from diluting a final correct answer.
    """
    by_question: dict[int, list[AISessionAnswer]] = {}
    for a in all_answers:
        by_question.setdefault(a.question_id, []).append(a)

    questions_answered = len(by_question)
    questions_correct  = 0
    best_scores: list[int] = []

    for qid, attempts in by_question.items():
        scores    = [a.score for a in attempts if a.score is not None]
        best      = max(scores) if scores else None
        is_correct = any(a.is_correct is True for a in attempts)

        if best is not None:
            best_scores.append(best)
        if is_correct or (best is not None and best >= 70):
            questions_correct += 1

    overall_score = int(sum(best_scores) / len(best_scores)) if best_scores else None
    return questions_answered, questions_correct, overall_score


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC SERVICE FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

async def create_session(
    user_id: int,
    subject_id: int,
    topic_id: int,
    concept_id: int,
    student_familiarity: str,
    student_note: Optional[str],
    intent: str,
    custom_intent_text: Optional[str],
    db: AsyncSession,
) -> AILearningSession:
    await _load_curriculum_chain(subject_id, topic_id, concept_id, db)

    session = AILearningSession(
        user_id=user_id,
        subject_id=subject_id,
        topic_id=topic_id,
        concept_id=concept_id,
        student_familiarity=student_familiarity,
        student_note=student_note,
        intent=intent,
        custom_intent_text=custom_intent_text,
        status="created",
        started_at=_now(),
    )
    db.add(session)
    await db.flush()

    familiarity_labels = {
        "new":         "completely new to this",
        "seen_before": "have seen this before",
        "know_basics": "know the basics",
        "know_well":   "know it well",
        "need_help":   "need help with something specific",
    }
    fam_label = familiarity_labels.get(student_familiarity, student_familiarity)
    welcome = (
        f"Welcome to your learning session! You've selected this concept and indicated you {fam_label}. "
        f"Your AI tutor is ready — select what you'd like to do to begin."
    )
    await _add_message(session.id, "system", "welcome", welcome, db)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(session_id: int, user_id: int, db: AsyncSession) -> dict:
    """
    Return session data.

    EXPLANATION HIDING: when session is in a protected state (retrieval, practice),
    teaching explanations are stripped from the response.  The raw text and key
    points are replaced with a placeholder — the DB record is untouched.
    """
    session = await _get_session_owned(
        session_id, user_id, db,
        load_messages=True,
        load_teaching=True,
        load_questions=True,
        load_summary=True,
        load_attempts=True,
        load_study_periods=True,
    )
    data = session.serialize()

    # Hydrate the curriculum labels needed by the learning room header/context.
    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )
    data["subjectName"] = subject.name
    data["topicName"] = topic.name
    data["conceptName"] = concept.name
    data["conceptExplanation"] = concept.explanation
    data["learningObjectives"] = [
        {
            "title": lo.title,
            "description": lo.description,
        }
        for lo in (topic.learning_objectives or [])
    ]

    in_protected_state = session.status in _PROTECTED_STATES

    # Current teaching snapshot (stripped during protected states)
    current_teaching = next((t for t in session.teaching if t.is_current), None)
    if current_teaching:
        t_data = current_teaching.serialize()
        if in_protected_state:
            # Hide teaching content — do NOT expose explanation during retrieval
            t_data["explanation"]    = None
            t_data["keyPoints"]      = []
            t_data["examples"]       = []
            t_data["formulas"]       = []
            t_data["analogies"]      = []
            t_data["workedExamples"] = []
            t_data["rawContent"]     = None
            t_data["_hidden"]        = True
        data["teaching"] = t_data
    else:
        data["teaching"] = None

    # Never expose allTeaching explanations to the student directly
    # (historical teaching available only after session completes)
    if session.status == "completed":
        data["allTeaching"] = [t.serialize() for t in session.teaching]
    else:
        data["allTeaching"] = []

    # Filter messages: during protected states exclude teaching-content messages
    all_messages = sorted(session.messages, key=lambda m: m.sequence)
    if in_protected_state:
        data["messages"] = _filter_protected_messages(all_messages)
    else:
        data["messages"] = [m.serialize() for m in all_messages]

    data["questions"]        = [q.serialize() for q in session.questions]

    # Return submitted answers for review/resume. Never expose expected answers here;
    # review details are only needed after a student has actually submitted.
    answers_result = await db.execute(
        select(AISessionAnswer)
        .where(AISessionAnswer.session_id == session_id)
        .order_by(AISessionAnswer.question_id, AISessionAnswer.attempt_number.desc())
    )
    latest_answers = {}
    for answer_row in answers_result.scalars().all():
        latest_answers.setdefault(answer_row.question_id, answer_row)

    review_answers = []
    question_by_id = {q.id: q for q in session.questions}
    timer_starts = [
        m for m in all_messages
        if m.message_type == "timer_start" and (m.extra or {}).get("taskIndex") is not None
    ]
    for question_id, answer_row in latest_answers.items():
        q = question_by_id.get(question_id)
        if not q:
            continue
        evaluation = answer_row.ai_evaluation or {}
        item = {
            **answer_row.serialize(),
            "understanding": evaluation.get("understanding"),
            "needsReteach": evaluation.get("needsReteach", False),
            "misconception": evaluation.get("misconception"),
            "recommendedStrategy": evaluation.get("recommendedStrategy"),
            "question": q.question,
            "questionType": q.question_type,
            "options": q.options,
            "correctAnswer": q.expected_answer if q.question_type != "multiple_choice" else None,
            "correctOptionLabel": _correct_option_label(q),
        }
        # Restore which learning task this answer belonged to without adding
        # another database column. Timer-start metadata is persisted in messages.
        prior_timers = [
            m for m in timer_starts
            if m.created_at <= answer_row.created_at
        ]
        if prior_timers:
            item["taskIndex"] = (prior_timers[-1].extra or {}).get("taskIndex")
        review_answers.append(item)
    data["answers"] = review_answers
    data["teachingAttempts"] = [a.serialize() for a in session.teaching_attempts]
    data["summary"]          = session.summary.serialize() if session.summary else None

    # Active study period info for resume
    active_period = next(
        (p for p in session.study_periods if p.timer_status == "active"), None
    )
    if active_period:
        remaining = max(
            0,
            int((active_period.expected_end_at - _now()).total_seconds())
        ) if active_period.expected_end_at else active_period.duration_seconds
        data["activeStudyPeriod"] = {
            **active_period.serialize(),
            "remainingSeconds": remaining,
        }
    else:
        data["activeStudyPeriod"] = None

    return data


async def get_session_messages(session_id: int, user_id: int, db: AsyncSession) -> list[dict]:
    """Return session messages with explanation hiding in protected states."""
    session = await _get_session_owned(session_id, user_id, db, load_messages=True)
    in_protected_state = session.status in _PROTECTED_STATES
    messages = sorted(session.messages, key=lambda m: m.sequence)
    if in_protected_state:
        return _filter_protected_messages(messages)
    return [m.serialize() for m in messages]


async def list_sessions(
    user_id: int,
    db: AsyncSession,
    *,
    status: Optional[str] = None,
    subject_id: Optional[int] = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    stmt = (
        select(AILearningSession)
        .options(selectinload(AILearningSession.summary))
        .where(AILearningSession.user_id == user_id)
        .order_by(AILearningSession.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        stmt = stmt.where(AILearningSession.status == status)
    if subject_id:
        stmt = stmt.where(AILearningSession.subject_id == subject_id)

    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return []

    subject_ids = list({r.subject_id for r in rows})
    topic_ids   = list({r.topic_id   for r in rows})
    concept_ids = list({r.concept_id for r in rows})

    subjects = {
        s.id: s.name
        for s in (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars()
    }
    topics = {
        t.id: t.name
        for t in (await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))).scalars()
    }
    concepts = {
        c.id: c.name
        for c in (await db.execute(select(Concept).where(Concept.id.in_(concept_ids)))).scalars()
    }

    result = []
    for r in rows:
        d = r.serialize()
        d["subjectName"]  = subjects.get(r.subject_id)
        d["topicName"]    = topics.get(r.topic_id)
        d["conceptName"]  = concepts.get(r.concept_id)
        d["overallScore"] = r.summary.overall_score if r.summary else None
        result.append(d)
    return result


async def abandon_session(session_id: int, user_id: int, db: AsyncSession) -> dict:
    session = await _get_session_owned(session_id, user_id, db)
    if session.status in ("completed", "abandoned"):
        return session.serialize()
    _set_status(session, "abandoned")
    await db.commit()
    await db.refresh(session)
    return session.serialize()


async def complete_session(session_id: int, user_id: int, db: AsyncSession) -> dict:
    """
    Mark session as completed.
    Guard: session must have reached retrieval or practice at some point.
    Early exit from 'created'/'teaching'/'studying' is treated as abandoned, not completed.
    """
    session = await _get_session_owned(session_id, user_id, db)
    if session.status in ("completed", "abandoned"):
        return session.serialize()

    # Completion is only valid after the learner has entered retrieval/practice.
    # Study mode is optional, but a completed room must contain retrieval evidence.
    ELIGIBLE_FOR_COMPLETION = {"retrieval", "practice"}
    if session.status not in ELIGIBLE_FOR_COMPLETION:
        # Force abandon rather than falsely mark as completed
        raise HTTPException(
            409,
            f"Session cannot be completed from state '{session.status}'. "
            f"Use /abandon to exit, or continue learning first."
        )

    session.status       = "completed"
    session.completed_at = _now()
    await db.commit()
    await db.refresh(session)
    return session.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# TEACHING
# ─────────────────────────────────────────────────────────────────────────────

async def teach_concept(session_id: int, user_id: int, db: AsyncSession, task_index: Optional[int] = None) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db, load_teaching=True, load_attempts=True
    )
    if session.status not in ("created", "teaching", "paused", "retrieval", "practice", "reteaching"):
        raise HTTPException(
            409,
            f"Cannot teach: session status is '{session.status}'."
        )

    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )

    used_strategies = [t.strategy for t in session.teaching]
    strategy        = _pick_next_strategy(used_strategies, session.intent)
    attempt_number  = len(used_strategies) + 1

    # Load the learner profile once for this function — passed to all prompt builders.
    _learner_profile = await lp_svc.get_profile(session.user_id, db)
    curriculum_ctx  = _build_curriculum_context(subject, topic, concept, session, _learner_profile)

    # Build or reuse the AI-generated learning plan. The plan is persisted inside
    # the teaching snapshot/message metadata, so no new database table is required.
    current_plan = []
    for existing in session.teaching:
        raw = existing.raw_content or ""
        try:
            candidate = parse_json(raw).get("learning_tasks")
            if isinstance(candidate, list) and candidate:
                current_plan = candidate
                break
        except Exception:
            pass

    task_context = ""
    selected_task = None
    orientation_mode = task_index is None
    if task_index is not None and current_plan:
        if task_index < 0 or task_index >= len(current_plan):
            raise HTTPException(400, "Invalid learning task.")
        selected_task = current_plan[task_index]
        selected_objectives = selected_task.get("objectiveIds") or selected_task.get("objective_ids") or []
        task_context = f"""
FOCUSED LEARNING TASK
Task number: {task_index + 1}
Task title: {selected_task.get("title", "Learning task")}
Task focus: {selected_task.get("focus", "")}
Task description: {selected_task.get("description", "")}
Curriculum objective IDs this task is mapped to: {selected_objectives or "(not mapped in a legacy plan)"}
Teach ONLY this task deeply enough for the student to study it and later retrieve it.
Do not teach the whole concept again. Connect briefly to prerequisite ideas when needed.
"""

    system_prompt = (
        "You are an expert AI tutor for PeerUP. Teach concepts clearly and adaptively. "
        "Return structured JSON only — no markdown outside JSON strings."
    )
    plan_instruction = """
Also create a learning plan for this concept. Break the concept into the smallest useful
learning tasks a student should master before considering the concept understood.
For Physics motion/SHM, for example, tasks could include meaning/definitions, quantities,
relationships, calculations, graphs/applications, and common mistakes — but choose tasks
that actually fit the supplied curriculum concept.
Each task must be concrete and independently assessable.
Choose 3–7 tasks. Choose a study duration of 2–10 minutes for each task based on complexity.
Return learning_tasks as:
[
  {"title":"...", "description":"...", "focus":"...", "recommended_minutes":5, "objective_ids":[101]}
]
""" if not current_plan else ""

    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session, _learner_profile)
    prompt = f"""{curriculum_ctx}

TEACHING TASK
Strategy to use: {strategy}
Attempt number: {attempt_number}
{task_context}
{plan_instruction}

If a focused learning task was supplied, teach ONLY that task deeply enough to study and retrieve later.
If no focused task was supplied, this is the orientation step: briefly introduce the concept and explain the learning plan,
but DO NOT teach all tasks yet. Keep the orientation to about 120–220 words.
Adapt depth and language to the student's familiarity ({session.student_familiarity}) and intent ({session.intent}).

Return JSON (all fields required; arrays may be empty []):
{{
  "explanation": "Natural tutor orientation (about 120–220 words) or focused task teaching (350–750 words).",
  "key_points": ["point 1", "point 2"],
  "examples": ["example 1", "example 2"],
  "formulas": ["formula 1"],
  "analogies": ["analogy 1"],
  "worked_examples": ["step-by-step worked example"],
  "misconceptions": ["common mistake to avoid"],
  "summary": "One-paragraph summary.",
  "study_prompt": "Short instruction telling the student what to focus on while studying.",
  "covered_objective_ids": [101],
  "learning_tasks": [{{"title":"...","description":"...","focus":"...","recommended_minutes":5,"objective_ids":[101]}}]
}}
"""
    try:
        raw, provider = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.7, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("AI teaching generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")

    if current_plan:
        parsed["learning_tasks"] = current_plan
    explanation  = _safe_str(parsed.get("explanation"), "Teaching content temporarily unavailable.")
    raw_plan = current_plan if current_plan else _safe_list(parsed.get("learning_tasks"))
    learning_tasks = []
    valid_objective_ids = {int(lo.id) for lo in (topic.learning_objectives or [])}
    for idx, task in enumerate(raw_plan, 1):
        if not isinstance(task, dict):
            continue
        try:
            mins = max(2, min(10, int(task.get("recommended_minutes", task.get("recommendedMinutes", 5)))))
        except Exception:
            mins = 5
        raw_obj_ids = task.get("objective_ids", task.get("objectiveIds", [])) or []
        mapped_objective_ids: list[int] = []
        for raw_id in raw_obj_ids:
            try:
                oid = int(raw_id)
            except (TypeError, ValueError):
                continue
            if oid in valid_objective_ids and oid not in mapped_objective_ids:
                mapped_objective_ids.append(oid)
        learning_tasks.append({
            "id": str(task.get("id") or f"task-{idx}"),
            "title": _safe_str(task.get("title"), f"Learning task {idx}"),
            "description": _safe_str(task.get("description"), ""),
            "focus": _safe_str(task.get("focus"), ""),
            "recommendedMinutes": mins,
            "objectiveIds": mapped_objective_ids,
            "order": idx,
        })
    summary_text = _safe_str(parsed.get("summary"), "")
    study_prompt = _safe_str(parsed.get("study_prompt"), "Take time to read through the material above carefully.")

    # Only focused teaching counts as objective coverage. The orientation may list
    # planned tasks, but it does not itself establish that those objectives were taught.
    if selected_task is not None:
        raw_covered = selected_task.get("objectiveIds") or selected_task.get("objective_ids") or parsed.get("covered_objective_ids") or []
    else:
        raw_covered = []
    covered_objective_ids: list[int] = []
    for raw_id in raw_covered:
        try:
            oid = int(raw_id)
        except (TypeError, ValueError):
            continue
        if oid in valid_objective_ids and oid not in covered_objective_ids:
            covered_objective_ids.append(oid)

    stored_raw_content = raw
    if current_plan:
        try:
            stored_payload = parse_json(raw)
            stored_payload["learning_tasks"] = learning_tasks
            stored_raw_content = json.dumps(stored_payload)
        except Exception:
            stored_raw_content = raw

    await _retire_current_teaching(session_id, db)

    teaching = AISessionTeaching(
        session_id=session_id,
        strategy=strategy,
        attempt_number=attempt_number,
        explanation=explanation,
        key_points=_safe_list(parsed.get("key_points")),
        examples=_safe_list(parsed.get("examples")),
        formulas=_safe_list(parsed.get("formulas")),
        analogies=_safe_list(parsed.get("analogies")),
        worked_examples=_safe_list(parsed.get("worked_examples")),
        misconceptions=_safe_list(parsed.get("misconceptions")),
        objective_ids=covered_objective_ids,
        summary=summary_text,
        raw_content=stored_raw_content,
        is_current=True,
    )
    db.add(teaching)
    await db.flush()

    attempt = AISessionTeachingAttempt(
        session_id=session_id,
        attempt_number=attempt_number,
        strategy=strategy,
        reason="initial_teaching" if attempt_number == 1 else "reteach_requested",
        teaching_snapshot_id=teaching.id,
    )
    db.add(attempt)

    message_content = f"{explanation}\n\n---\n*{study_prompt}*"
    await _add_message(
        session_id, "ai", "teaching", message_content, db,
        extra={
            "strategy": strategy,
            "teachingId": teaching.id,
            "provider": provider,
            "learningPlan": learning_tasks,
            "taskIndex": task_index,
            "taskTitle": selected_task.get("title") if selected_task else None,
        },
    )

    if session.status == "created":
        _set_status(session, "teaching")

    await db.commit()
    await db.refresh(teaching)
    return teaching.serialize()


async def respond_to_student(
    session_id: int, user_id: int, content: str, db: AsyncSession
) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db, load_messages=True, load_teaching=True
    )
    # Allow post-session follow-up questions; only block abandoned sessions
    if session.status == "abandoned":
        raise HTTPException(409, "Session is closed.")

    is_post_session = session.status == "completed"

    await _add_message(session_id, "student", "question", content, db)
    await db.flush()

    # Build recent history (exclude system/timer messages)
    recent_msgs = sorted(session.messages, key=lambda m: m.sequence)[-_CHAT_HISTORY_WINDOW:]
    history_text = "\n".join(
        f"{'Student' if m.role == 'student' else 'Tutor'}: {m.content[:400]}"
        for m in recent_msgs
        if m.message_type not in ("welcome", "system", "timer_start", "timer_end")
    )

    current_teaching = await _get_current_teaching(session_id, db)
    teaching_context = ""
    if current_teaching and not is_post_session:
        teaching_context = (
            f"\nCurrent teaching snapshot (strategy: {current_teaching.strategy}):\n"
            f"{(current_teaching.explanation or '')[:600]}"
        )

    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )
    _learner_profile_chat = await lp_svc.get_profile(session.user_id, db)
    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session, _learner_profile_chat)

    post_session_directive = ""
    if is_post_session:
        post_session_directive = """
POST-SESSION FOLLOW-UP RULES:
- The student has completed the session. They are asking a follow-up question.
- ALWAYS answer educational questions fully, regardless of subject or topic.
- After answering, detect whether the question is:
  a) About the SAME concept as this session -> suggest_new_session: false
  b) About a DIFFERENT topic in the same or different subject -> suggest_new_session: true
  c) Non-educational (jokes, homework writing, etc.) -> politely redirect, suggest_new_session: false
- If suggest_new_session is true, identify the subject and topic the question belongs to,
  and write a brief session_note (1-2 sentences) describing what the student needs to work on.
- Be warm and encouraging. This is a learning platform for students.
"""

    # Count substantive exchanges so the AI can judge readiness
    teaching_exchange_count = sum(
        1 for m in session.messages
        if m.role == "student" and m.message_type not in ("welcome", "system")
    )

    system_prompt = (
        "You are an AI tutor on PeerUP, a peer learning platform for students. "
        "You always answer educational questions helpfully and warmly. "
        "Return JSON only — no markdown outside the response field."
    )

    # Agentic action rules — only applies during active (non-completed) sessions
    agentic_directive = ""
    if not is_post_session:
        agentic_directive = f"""
AGENTIC PROGRESSION RULES (critical — follow exactly):
You are the teacher driving this session. You must decide when the student is ready for the quiz.
Current exchange count: {teaching_exchange_count}

action field rules:
- null         → continue teaching/conversing normally
- "ask_readiness" → ask the learner whether they are ready for a quick check; do NOT start practice yet
- "start_quiz" → trigger Practice Mode only after the learner has explicitly confirmed readiness
- "mark_task_done" → only AFTER a quiz was passed (score ≥ 70); mark current task complete
- "next_task"  → immediately after mark_task_done to proceed to the next task
- "complete_session" → all tasks done and passed

When to signal "ask_readiness":
- The learner has had enough teaching/explanation to reasonably check understanding
- The learner says they understand, e.g. "I understand", "that makes sense", "I get it", or equivalent
- The learner is not asking for another explanation at that moment

When to signal "start_quiz":
- The immediately preceding tutor response asked whether the learner is ready for a quick check
- The learner explicitly confirms readiness, e.g. "yes", "ready", "let's do it", "sure", or equivalent
- Never start practice merely because the learner asked a normal educational question

When NOT to signal either action:
- Student is still asking basic questions or confused
- The tutor has not established enough understanding to check
- Session is completed (post-session follow-up)

action_data field:
- For start_quiz: {{"task_index": current_task_index, "reason": "one sentence why the student is ready"}}
- For other actions: {{"reason": "brief explanation"}}
- null when action is null
"""

    prompt = f"""{curriculum_ctx}
{teaching_context}
{post_session_directive}
{agentic_directive}

RECENT CONVERSATION:
{history_text}

Student just asked: {content}

Return JSON:
{{
  "response": "Your full tutor response here (markdown supported, be thorough)",
  "action": null,
  "action_data": null,
  "suggest_new_session": false,
  "detected_subject": null,
  "detected_topic": null,
  "session_note": null
}}

Rules:
- response: always required, always educational
- action: null | "ask_readiness" | "start_quiz" | "mark_task_done" | "next_task" | "complete_session"
- action_data: object with task_index and reason, or null
- suggest_new_session: true only if question is from a clearly different topic/subject (post-session only)
- detected_subject: name of the subject if suggest_new_session is true, else null
- detected_topic: name of the topic if suggest_new_session is true, else null
- session_note: 1-2 sentence note for the new session tutor about what the student needs, else null
"""
    try:
        raw, provider = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.7, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("AI respond failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")

    response_text = _safe_str(parsed.get("response"), "I'm sorry, I couldn't generate a response right now.")
    suggest_new_session = bool(parsed.get("suggest_new_session", False))
    detected_subject   = parsed.get("detected_subject") or None
    detected_topic     = parsed.get("detected_topic") or None
    session_note       = parsed.get("session_note") or None

    # Agentic action signal — only valid during active sessions
    action      = parsed.get("action") or None
    action_data = parsed.get("action_data") or None
    valid_actions = {"ask_readiness", "start_quiz", "mark_task_done", "next_task", "complete_session"}
    if is_post_session or action not in valid_actions:
        action      = None
        action_data = None

    # Deterministic readiness gate: the learner must see a readiness question
    # before Practice Mode can begin. This protects the lifecycle even when a
    # model returns an over-eager start_quiz action.
    previous_ai = next(
        (m for m in reversed(sorted(session.messages, key=lambda m: m.sequence))
         if m.role == "ai" and m.message_type in ("teaching", "reteach")),
        None,
    )
    confirmation = bool(_READINESS_CONFIRMATION_RE.fullmatch(content.strip()))
    previous_asked_readiness = bool(previous_ai and _READINESS_SIGNAL_RE.search(previous_ai.content or ""))
    if confirmation and previous_asked_readiness:
        action = "start_quiz"
        action_data = {"task_index": None, "reason": "The learner explicitly confirmed readiness."}
    elif action == "start_quiz":
        action = "ask_readiness"
        action_data = {"reason": "The learner needs to explicitly confirm readiness before practice."}
        response_text = "You’ve covered enough for a quick check. Are you ready to test what you understand?"
    elif action is None and _UNDERSTANDING_SIGNAL_RE.search(content or ""):
        action = "ask_readiness"
        action_data = {"reason": "The learner indicated understanding and can be invited to a quick check."}
        response_text = "Great. Are you ready for a quick check?"

    msg = await _add_message(
        session_id, "ai", "teaching", response_text, db,
        extra={
            "provider": provider,
            "inResponseTo": content[:100],
            "suggestNewSession": suggest_new_session,
            "detectedSubject": detected_subject,
            "detectedTopic": detected_topic,
            "sessionNote": session_note,
            # Agentic fields — read by frontend to drive autonomous progression
            "action": action,
            "actionData": action_data,
        },
    )
    await db.commit()
    await db.refresh(msg)
    return msg.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# STUDY TIMER  (server-authoritative)
# ─────────────────────────────────────────────────────────────────────────────

async def start_study_period(
    session_id: int, user_id: int, duration_seconds: int, db: AsyncSession, task_index: Optional[int] = None
) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db, load_study_periods=True
    )
    if session.status not in ("teaching", "reteaching"):
        raise HTTPException(
            409,
            f"Cannot start study period: session is '{session.status}'. Must be teaching or reteaching."
        )

    # Guard: reject if an active study period already exists for this session
    active = next(
        (p for p in session.study_periods if p.timer_status == "active"), None
    )
    if active:
        raise HTTPException(
            409,
            "A study period is already active. Finish it before starting another."
        )

    started      = _now()
    expected_end = started + timedelta(seconds=duration_seconds)

    period = AISessionStudyPeriod(
        session_id=session_id,
        duration_seconds=duration_seconds,
        started_at=started,
        expected_end_at=expected_end,
        timer_status="active",
    )
    db.add(period)
    await db.flush()

    _set_status(session, "studying")
    await _add_message(
        session_id, "system", "timer_start",
        f"Study timer started: {duration_seconds} seconds.",
        db,
        extra={"studyPeriodId": period.id, "durationSeconds": duration_seconds, "taskIndex": task_index},
    )
    await db.commit()
    await db.refresh(period)
    return period.serialize()


async def finish_study_period(
    session_id: int, user_id: int, study_period_id: int, db: AsyncSession
) -> dict:
    """
    Server-authoritative timer finish.

    Rules:
      - If server time >= expected_end_at  → accept as completed.
      - If server time >= 20% of allocated → accept as interrupted (early exit).
      - If server time <  20% of allocated → REJECT with 409 (too early).
    """
    session = await _get_session_owned(session_id, user_id, db)
    result  = await db.execute(
        select(AISessionStudyPeriod).where(
            AISessionStudyPeriod.id         == study_period_id,
            AISessionStudyPeriod.session_id == session_id,
        )
    )
    period = result.scalar_one_or_none()
    if not period:
        raise HTTPException(404, "Study period not found.")
    if period.timer_status != "active":
        raise HTTPException(409, "Study period is not active.")

    now        = _now()
    elapsed    = (now - period.started_at).total_seconds()
    allocated  = period.duration_seconds
    min_early  = allocated * _EARLY_FINISH_MIN_FRACTION

    if elapsed < min_early:
        raise HTTPException(
            409,
            f"Study period started only {int(elapsed)}s ago. "
            f"Minimum {int(min_early)}s must elapse before finishing early."
        )

    # Determine timer outcome
    if period.expected_end_at and now >= period.expected_end_at:
        timer_status = "completed"
    else:
        timer_status = "interrupted"

    period.ended_at      = now
    period.timer_status  = timer_status

    _set_status(session, "retrieval")
    await _add_message(
        session_id, "system", "timer_end",
        "Study time complete. Time for a quick retrieval check!",
        db,
        extra={"studyPeriodId": study_period_id, "timerStatus": timer_status},
    )
    await db.commit()
    await db.refresh(period)
    return period.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# RETRIEVAL QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

async def generate_retrieval_questions(
    session_id: int, user_id: int, db: AsyncSession, *, count: int = 3, task_index: Optional[int] = None
) -> list[dict]:
    session = await _get_session_owned(
        session_id, user_id, db, load_teaching=True
    )
    # Allow question generation from teaching/reteaching — the AI may signal
    # start_quiz before the study timer has been started (agentic flow).
    if session.status not in ("teaching", "retrieval", "practice", "reteaching"):
        raise HTTPException(
            409,
            f"Cannot generate questions: session is '{session.status}'."
        )
    # A newly generated retrieval always follows teaching or reteaching.
    # Use the state machine here rather than assigning the status directly.
    if session.status in ("teaching", "reteaching"):
        _set_status(session, "retrieval")

    # Once questions are generated the room is immediately in Practice Mode.
    # The existing retrieval/question architecture remains the source of truth;
    # this only makes the persisted session state match the Learning Room UX.
    if session.status == "retrieval":
        _set_status(session, "practice")

    current_teaching = await _get_current_teaching(session_id, db)
    if not current_teaching:
        raise HTTPException(409, "No teaching content found. Teach the concept first.")

    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )

    teaching_summary = (
        f"Strategy used: {current_teaching.strategy}\n"
        f"Explanation (first 800 chars): {(current_teaching.explanation or '')[:800]}\n"
        f"Key points: {', '.join(current_teaching.key_points or [])}\n"
        f"Examples covered: {', '.join((current_teaching.examples or [])[:3])}"
    )

    task_context = ""
    if task_index is not None:
        task_msg_result = await db.execute(
            select(AISessionMessage)
            .where(
                AISessionMessage.session_id == session_id,
                AISessionMessage.message_type == "teaching",
            )
            .order_by(AISessionMessage.sequence.desc())
            .limit(1)
        )
        task_msg = task_msg_result.scalar_one_or_none()
        extra = task_msg.extra or {} if task_msg else {}
        task_context = (
            f"THIS RETRIEVAL CHECK IS FOR LEARNING TASK {task_index + 1}. "
            f"Task: {extra.get('taskTitle', 'current task')}. "
            "Test this task specifically and do not assess unrelated material."
        )

    system_prompt = (
        "You are an expert AI tutor generating retrieval practice questions. "
        "Questions must test understanding of what was actually taught, not generic knowledge. "
        "Return JSON only."
    )
    prompt = f"""CURRICULUM CONTEXT
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}

WHAT WAS TAUGHT (ground questions ONLY in this content — do not test knowledge not covered):
{teaching_summary}

{task_context}

STUDENT CONTEXT
Familiarity: {session.student_familiarity} | Intent: {session.intent}

Generate exactly {count} retrieval questions testing understanding of the teaching above.
Include variety: mix question types. At least one must be short_answer or explanation.
Do NOT reveal the answer in the question text.

Return JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "question_type": "short_answer|multiple_choice|calculation|explanation|true_false|application",
      "options": null,
      "expected_answer": "Model answer for AI evaluation only",
      "rubric": "What to look for when marking"
    }}
  ]
}}

For multiple_choice: options must be [{{"label":"A","text":"..."}}, ...] and expected_answer MUST be exactly the correct option label (for example "A"). All others: null.
"""
    try:
        raw, _ = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.6, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Question generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")

    raw_questions = _safe_list(parsed.get("questions"))
    if not raw_questions:
        raise HTTPException(502, "AI returned no questions.")

    # Determine next sequence number
    seq_result = await db.execute(
        select(AISessionQuestion.sequence)
        .where(AISessionQuestion.session_id == session_id)
        .order_by(AISessionQuestion.sequence.desc())
        .limit(1)
    )
    last_seq = seq_result.scalar_one_or_none() or 0

    VALID_QTYPES = {"short_answer", "multiple_choice", "calculation", "explanation", "true_false", "application"}
    created = []
    for i, q in enumerate(raw_questions[:count], 1):
        qtype = q.get("question_type", "short_answer")
        if qtype not in VALID_QTYPES:
            qtype = "short_answer"
        obj = AISessionQuestion(
            session_id=session_id,
            question=_safe_str(q.get("question"), "Question unavailable."),
            question_type=qtype,
            options=q.get("options") if qtype == "multiple_choice" else None,
            expected_answer=_safe_str(q.get("expected_answer")),
            rubric=_safe_str(q.get("rubric")),
            sequence=last_seq + i,
        )
        db.add(obj)
        await db.flush()
        created.append(obj)

    await db.commit()
    for obj in created:
        await db.refresh(obj)
    return [q.serialize() for q in created]


# ─────────────────────────────────────────────────────────────────────────────
# ANSWER SUBMISSION + EVALUATION
# ─────────────────────────────────────────────────────────────────────────────

def _correct_option_label(question: AISessionQuestion) -> Optional[str]:
    """Return the MC option label when the server-side expected answer identifies one."""
    if question.question_type != "multiple_choice" or not question.options:
        return None
    expected = (question.expected_answer or "").strip().lower()
    if not expected:
        return None
    for opt in question.options:
        if not isinstance(opt, dict):
            continue
        label = str(opt.get("label") or "").strip()
        text = str(opt.get("text") or "").strip()
        if expected == label.lower() or expected == text.lower() or expected == f"option {label}".lower():
            return label
    # Common model format: "A - ..." or "A) ..."
    for opt in question.options:
        if not isinstance(opt, dict):
            continue
        label = str(opt.get("label") or "").strip()
        if label and expected.startswith(label.lower()) and expected[len(label):len(label)+1] in ("-", ")", ":", ".", " "):
            return label
    return None


async def _generate_and_store_observations(
    *,
    user_id: int,
    session: AILearningSession,
    question: AISessionQuestion,
    answer: AISessionAnswer,
    understanding: str,
    needs_reteach: bool,
    misconception: Optional[str],
    recommended_strategy: Optional[str],
    subject_name: Optional[str],
    db: AsyncSession,
) -> None:
    """
    Generate structured AI observations from a single answer evaluation and
    append them to the student's learning profile.

    Observations are evidence-based statements with a confidence score.
    They are kept separate from the student's self-reported preferences and
    never overwrite them.  Only observations with confidence >= 0.50 are stored
    (enforced inside learning_profile_service.append_observations_bulk).
    """
    observations: list[dict] = []
    session_id = session.id

    # ── 1. Teaching-strategy effectiveness ───────────────────────────────
    # Find the strategy that was active when this answer was produced.
    current_teaching = await _get_current_teaching(session_id, db)
    if current_teaching:
        strategy = current_teaching.strategy
        if understanding == "strong":
            observations.append({
                "type": "learning_observation",
                "category": "teaching_strategy",
                "observation": (
                    f"Student demonstrated strong understanding after a "
                    f"'{strategy}' explanation — answers scored {answer.score}/100."
                ),
                "strategy": strategy,
                "confidence": min(0.90, 0.65 + (answer.score or 0) / 200),
                "source": "retrieval_answer",
                "session_id": session_id,
            })
        elif understanding == "weak" and needs_reteach:
            observations.append({
                "type": "learning_observation",
                "category": "teaching_strategy",
                "observation": (
                    f"Student struggled after a '{strategy}' explanation "
                    f"(score: {answer.score}/100). A different approach may work better."
                ),
                "strategy": strategy,
                "confidence": min(0.85, 0.55 + max(0, 50 - (answer.score or 0)) / 100),
                "source": "retrieval_answer",
                "session_id": session_id,
            })

    # ── 2. Misconception observation ──────────────────────────────────────
    if misconception:
        observations.append({
            "type": "learning_observation",
            "category": "misconception",
            "observation": misconception,
            "confidence": 0.78,
            "source": "retrieval_answer",
            "session_id": session_id,
        })

    # ── 3. Subject-level strength observation (strong performance) ────────
    if understanding == "strong" and answer.score is not None and answer.score >= 85:
        # Resolve subject name lazily if not provided
        subject_label = subject_name
        if not subject_label:
            try:
                subj = (await db.execute(
                    select(AILearningSession).where(AILearningSession.id == session_id)
                )).scalar_one_or_none()
                if subj:
                    from app.models.curriculum import Subject as SubjectModel
                    s = (await db.execute(
                        select(SubjectModel).where(SubjectModel.id == subj.subject_id)
                    )).scalar_one_or_none()
                    subject_label = s.name if s else None
            except Exception:
                pass

        if subject_label:
            observations.append({
                "type": "learning_observation",
                "category": "strength",
                "observation": (
                    f"Student answered a {subject_label} retrieval question correctly "
                    f"with a score of {answer.score}/100."
                ),
                "confidence": 0.72,
                "source": "retrieval_answer",
                "session_id": session_id,
            })

    # ── 4. Persistent struggle observation ───────────────────────────────
    if understanding == "weak" and answer.attempt_number >= 2:
        observations.append({
            "type": "learning_observation",
            "category": "struggle",
            "observation": (
                f"Student has answered this question incorrectly across "
                f"{answer.attempt_number} attempts (latest score: {answer.score}/100)."
            ),
            "confidence": min(0.90, 0.60 + answer.attempt_number * 0.10),
            "source": "repeated_attempts",
            "session_id": session_id,
        })

    if observations:
        await lp_svc.append_observations_bulk(user_id, observations, db)


async def submit_answer(
    session_id: int,
    user_id: int,
    question_id: int,
    student_answer: str,
    response_time_seconds: Optional[int],
    db: AsyncSession,
) -> dict:
    session = await _get_session_owned(session_id, user_id, db)
    if session.status not in ("retrieval", "practice"):
        raise HTTPException(409, f"Answers can only be submitted during retrieval; session is '{session.status}'.")

    # Verify question belongs to this session (cross-session injection guard)
    q_result = await db.execute(
        select(AISessionQuestion).where(
            AISessionQuestion.id         == question_id,
            AISessionQuestion.session_id == session_id,
        )
    )
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(404, "Question not found in this session.")

    # FIX: read scalar exactly once to determine previous attempt number
    prev_result = await db.execute(
        select(AISessionAnswer.attempt_number)
        .where(
            AISessionAnswer.session_id  == session_id,
            AISessionAnswer.question_id == question_id,
        )
        .order_by(AISessionAnswer.attempt_number.desc())
        .limit(1)
    )
    previous_attempt = prev_result.scalar_one_or_none() or 0
    attempt_number   = previous_attempt + 1

    answer = AISessionAnswer(
        session_id=session_id,
        question_id=question_id,
        student_answer=student_answer,
        attempt_number=attempt_number,
        response_time_seconds=response_time_seconds,
    )
    db.add(answer)
    await db.flush()

    # AI evaluation
    system_prompt = (
        "You are an AI tutor evaluating a student's answer. "
        "Be fair, constructive, and encouraging. Return JSON only."
    )
    prompt = f"""QUESTION: {question.question}
QUESTION TYPE: {question.question_type}
EXPECTED ANSWER: {question.expected_answer or '(use your knowledge to assess)'}
MARKING RUBRIC: {question.rubric or '(assess understanding and accuracy)'}

STUDENT ANSWER: {student_answer}

Evaluate the student's answer. Return JSON:
{{
  "is_correct": true or false,
  "score": 0-100,
  "understanding": "strong" or "partial" or "weak",
  "feedback": "Constructive feedback — what was right, what was wrong, how to improve.",
  "misconception": "Identified misconception if any, or null",
  "needs_reteach": true or false,
  "recommended_strategy": "suggested reteaching strategy if needs_reteach is true, or null"
}}

Scoring guide:
  strong  (>= 80): student clearly understands — no reteach needed
  partial (50-79): some understanding but gaps — targeted practice helpful
  weak    (<  50): significant gaps — reteach with a different approach
"""
    try:
        raw, provider = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.4, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Answer evaluation failed: %s", exc)
        parsed = {
            "is_correct": None, "score": None,
            "understanding": "partial",
            "feedback": "Evaluation temporarily unavailable. Your answer has been recorded.",
            "misconception": None, "needs_reteach": False, "recommended_strategy": None,
        }
        provider = "none"

    # Clamp and validate AI output
    raw_score   = parsed.get("score")
    score_val   = _safe_int(raw_score, 0, 100)
    understanding = parsed.get("understanding", "partial")
    if understanding not in ("strong", "partial", "weak"):
        understanding = "partial"
    needs_reteach = bool(parsed.get("needs_reteach", False))

    # Uncertainty is a valid learner response, not an application error. Make
    # the weak-evidence outcome deterministic even if the evaluator model
    # returns an inconsistent score for phrases such as "I don't know yet".
    uncertainty_response = _is_uncertainty_response(student_answer)
    if uncertainty_response:
        score_val = 0
        understanding = "weak"
        needs_reteach = True
        parsed["is_correct"] = False
        if not _safe_str(parsed.get("feedback")):
            parsed["feedback"] = (
                "That is useful evidence: you are not confident with this yet. "
                "I’ll teach it from a different angle and check your understanding again."
            )

    # The learning-room policy is explicit: strong understanding can continue;
    # partial/weak understanding gets a different teaching approach before the
    # next retrieval check. The score guard keeps the model from accidentally
    # marking a low-scoring answer as strong.
    if understanding in ("weak", "partial"):
        needs_reteach = True
    if score_val is not None and score_val < 50:
        needs_reteach = True
        if understanding == "strong":
            understanding = "weak"

    answer.is_correct    = bool(parsed.get("is_correct")) if parsed.get("is_correct") is not None else (score_val is not None and score_val >= 70)
    answer.score         = score_val
    answer.feedback      = _safe_str(parsed.get("feedback"))
    answer.ai_evaluation = {
        "understanding":        understanding,
        "misconception":        parsed.get("misconception"),
        "needsReteach":         needs_reteach,
        "recommendedStrategy":  parsed.get("recommended_strategy"),
        "provider":             provider,
    }

    # Associate the answer with the learning task that was active when its timer started.
    task_index = None
    msg_result = await db.execute(
        select(AISessionMessage)
        .where(
            AISessionMessage.session_id == session_id,
            AISessionMessage.message_type == "timer_start",
        )
        .order_by(AISessionMessage.sequence.desc())
        .limit(1)
    )
    latest_timer_message = msg_result.scalar_one_or_none()
    if latest_timer_message and latest_timer_message.extra:
        task_index = latest_timer_message.extra.get("taskIndex")

    # Persist the practice interaction in the same conversation stream.
    # No second chat/message system is used: the existing learning-session
    # messages are the canonical history for both teaching and practice.
    await _add_message(
        session_id, "student", "answer",
        f"**Practice question:** {question.question}\n\n**Answer:** {student_answer}",
        db,
        extra={"questionId": question_id, "answerId": answer.id, "practice": True},
    )

    # Feedback message
    correctness_label = "Correct!" if answer.is_correct else ("Close." if understanding == "partial" else "Not quite.")
    score_display     = f"{answer.score}/100" if answer.score is not None else "–"
    feedback_content  = (
        f"**{correctness_label}** (Score: {score_display})\n\n"
        f"{answer.feedback}"
    )
    await _add_message(
        session_id, "ai", "feedback", feedback_content, db,
        extra={
            "questionId":    question_id,
            "answerId":      answer.id,
            "score":         answer.score,
            "understanding": understanding,
        },
    )

    # Transition session if appropriate
    if session.status == "retrieval" and needs_reteach:
        _set_status(session, "reteaching")
    elif session.status == "retrieval" and not needs_reteach:
        _set_status(session, "practice")

    await db.commit()
    await db.refresh(answer)

    # ── Generate and persist AI observations from this answer ─────────────
    # Best-effort: observation failure must never block the answer response.
    try:
        await _generate_and_store_observations(
            user_id=user_id,
            session=session,
            question=question,
            answer=answer,
            understanding=understanding,
            needs_reteach=needs_reteach,
            misconception=parsed.get("misconception"),
            recommended_strategy=parsed.get("recommended_strategy"),
            subject_name=None,  # resolved lazily inside the helper
            db=db,
        )
    except Exception as obs_exc:
        logger.warning("Observation generation failed (non-fatal): %s", obs_exc)

    result = {
        **answer.serialize(),
        "understanding":       understanding,
        "needsReteach":        needs_reteach,
        "misconception":       parsed.get("misconception"),
        "recommendedStrategy": parsed.get("recommended_strategy"),
        "question":            question.question,
        "questionType":        question.question_type,
        "options":             question.options,
        "correctAnswer":       question.expected_answer if question.question_type != "multiple_choice" else None,
        "correctOptionLabel":  _correct_option_label(question),
        "taskIndex":           task_index,
    }
    return result


async def complete_practice_run(
    session_id: int, user_id: int, question_ids: list[int], db: AsyncSession
) -> dict:
    """Close the current practice run without creating a new session.

    All answers have already been persisted/evaluated by submit_answer. This
    endpoint only advances the session back into normal conversation mode so
    the frontend can restore the chat and, when needed, request adaptive
    reteaching as a normal chat response.
    """
    session = await _get_session_owned(session_id, user_id, db)
    if session.status != "practice":
        raise HTTPException(409, f"Practice run is not active; session is '{session.status}'.")

    ids = {int(qid) for qid in question_ids}
    if not ids:
        raise HTTPException(400, "At least one practice question is required.")

    result = await db.execute(
        select(AISessionAnswer).where(
            AISessionAnswer.session_id == session_id,
            AISessionAnswer.question_id.in_(ids),
        )
    )
    answers = result.scalars().all()
    if {a.question_id for a in answers} != ids:
        raise HTTPException(409, "The practice run contains unanswered questions.")

    needs_reteach = any(
        bool((a.ai_evaluation or {}).get("needsReteach")) or (a.score is not None and a.score < 70)
        for a in answers
    )

    _set_status(session, "teaching")
    await _add_message(
        session_id, "system", "practice",
        "Practice complete. Your learning conversation is restored.",
        db,
        extra={
            "practiceComplete": True,
            "questionIds": sorted(ids),
            "needsReteach": needs_reteach,
        },
    )
    await db.commit()
    await db.refresh(session)
    return {
        **session.serialize(),
        "needsReteach": needs_reteach,
        "questionIds": sorted(ids),
    }


# ─────────────────────────────────────────────────────────────────────────────
# ADAPTIVE RETEACHING
# ─────────────────────────────────────────────────────────────────────────────

async def generate_adaptive_reteach(
    session_id: int, user_id: int, reason: Optional[str], db: AsyncSession
) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db, load_teaching=True, load_attempts=True
    )
    if session.status not in ("retrieval", "reteaching", "teaching", "practice"):
        raise HTTPException(
            409,
            f"Cannot reteach: session is '{session.status}'."
        )

    # Failed retrievals already leave the session in ``reteaching``.  Do not
    # attempt reteaching→reteaching; enter the state only when needed, then
    # return to retrieval after the new teaching snapshot is persisted.
    _begin_adaptive_reteach(session)

    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )

    used_strategies = [t.strategy for t in session.teaching]
    new_strategy    = _pick_next_strategy(used_strategies, session.intent)
    attempt_number  = len(session.teaching) + 1

    # FIX: Use .mappings() to avoid Row attribute access bugs
    recent_rows = (await db.execute(
        select(AISessionAnswer, AISessionQuestion)
        .join(AISessionQuestion, AISessionAnswer.question_id == AISessionQuestion.id)
        .where(AISessionAnswer.session_id == session_id)
        .order_by(AISessionAnswer.created_at.desc())
        .limit(5)
    )).all()

    # Extract misconceptions from AI evaluations
    identified_misconceptions = []
    for row in recent_rows:
        ans = row[0]  # AISessionAnswer
        if ans.ai_evaluation and ans.ai_evaluation.get("misconception"):
            identified_misconceptions.append(ans.ai_evaluation["misconception"])

    struggle_context = "\n".join(
        f"  Q: {row[1].question}\n  A: {row[0].student_answer}\n  Score: {row[0].score}/100"
        for row in recent_rows
    ) or "  (no previous answers — student requested reteaching directly)"

    misconception_note = ""
    if identified_misconceptions:
        misconception_note = (
            f"\nIDENTIFIED MISCONCEPTIONS (address these directly):\n"
            + "\n".join(f"  - {m}" for m in identified_misconceptions[:3])
        )

    _learner_profile_reteach = await lp_svc.get_profile(session.user_id, db)
    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session, _learner_profile_reteach)

    system_prompt = (
        "You are an adaptive AI tutor. The student struggled with this concept. "
        "Use a completely different teaching approach — do NOT repeat previous explanations. "
        "Return JSON only."
    )
    prompt = f"""{curriculum_ctx}

PREVIOUS STRATEGIES USED: {', '.join(used_strategies)}
NEW STRATEGY: {new_strategy}
STUDENT STRUGGLES (recent answers):
{struggle_context}
{misconception_note}
STUDENT REASON: {reason or '(none given)'}

Reteach this concept from scratch using the '{new_strategy}' strategy.
Make it genuinely different — a fresh angle addressing the student's actual struggles.
{f"Specifically address: {identified_misconceptions[0]}" if identified_misconceptions else ""}

Return JSON (all array fields required; may be empty):
{{
  "explanation": "Complete reteaching using {new_strategy} strategy. 400–700 words.",
  "key_points": ["point 1"],
  "examples": ["example 1"],
  "formulas": [],
  "analogies": [],
  "worked_examples": [],
  "misconceptions": [],
  "summary": "Brief summary of this new explanation.",
  "encouragement": "Short encouraging message for the student.",
  "covered_objective_ids": [101]
}}
"""
    try:
        raw, provider = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.75, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Reteach generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")

    explanation   = _safe_str(parsed.get("explanation"), "Reteaching content temporarily unavailable.")
    encouragement = _safe_str(parsed.get("encouragement"), "A different perspective can make all the difference!")

    valid_objective_ids = {int(lo.id) for lo in (topic.learning_objectives or [])}
    covered_objective_ids: list[int] = []
    raw_covered = parsed.get("covered_objective_ids") or []
    for raw_id in raw_covered:
        try:
            oid = int(raw_id)
        except (TypeError, ValueError):
            continue
        if oid in valid_objective_ids and oid not in covered_objective_ids:
            covered_objective_ids.append(oid)

    await _retire_current_teaching(session_id, db)

    teaching = AISessionTeaching(
        session_id=session_id,
        strategy=new_strategy,
        attempt_number=attempt_number,
        explanation=explanation,
        key_points=_safe_list(parsed.get("key_points")),
        examples=_safe_list(parsed.get("examples")),
        formulas=_safe_list(parsed.get("formulas")),
        analogies=_safe_list(parsed.get("analogies")),
        worked_examples=_safe_list(parsed.get("worked_examples")),
        misconceptions=_safe_list(parsed.get("misconceptions")),
        objective_ids=covered_objective_ids,
        summary=_safe_str(parsed.get("summary")),
        raw_content=raw,
        is_current=True,
    )
    db.add(teaching)
    await db.flush()

    attempt = AISessionTeachingAttempt(
        session_id=session_id,
        attempt_number=attempt_number,
        strategy=new_strategy,
        reason=reason or "student_struggled",
        teaching_snapshot_id=teaching.id,
    )
    db.add(attempt)

    # Update previous attempt outcome
    if session.teaching_attempts:
        prev_attempt = sorted(session.teaching_attempts, key=lambda a: a.attempt_number)[-1]
        if prev_attempt.outcome is None:
            prev_attempt.outcome = "still_struggling"

    message_content = f"{explanation}\n\n---\n*{encouragement}*"
    await _add_message(
        session_id, "ai", "reteach", message_content, db,
        extra={"strategy": new_strategy, "teachingId": teaching.id, "provider": provider},
    )

    # The reteach content is now persisted and becomes the source for the next
    # retrieval check.  This is the critical lifecycle transition:
    # retrieval → reteaching → retrieval, never reteaching → reteaching.
    _finish_adaptive_reteach(session)
    await db.commit()

    # Record that the AI switched strategy — this is itself an observation.
    try:
        await lp_svc.append_observation(
            session.user_id,
            {
                "type": "learning_observation",
                "category": "teaching_strategy",
                "observation": (
                    f"Student required reteaching — AI switched from previous strategy "
                    f"to '{new_strategy}'. Reason: {reason or 'student struggled'}."
                ),
                "strategy": new_strategy,
                "confidence": 0.65,
                "source": "adaptive_reteach",
                "session_id": session_id,
            },
            db,
        )
    except Exception as obs_exc:
        logger.warning("Reteach observation failed (non-fatal): %s", obs_exc)

    await db.refresh(teaching)
    return teaching.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# SESSION SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

async def generate_session_summary(
    session_id: int, user_id: int, db: AsyncSession
) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db,
        load_teaching=True, load_questions=True,
        load_attempts=True, load_summary=True,
    )
    if session.status not in ("retrieval", "practice", "completed"):
        raise HTTPException(409, f"Cannot summarize: session is '{session.status}'. Complete a retrieval check first.")

    answers_result = await db.execute(
        select(AISessionAnswer).where(AISessionAnswer.session_id == session_id)
    )
    all_answers = answers_result.scalars().all()

    # FIX: best-per-question scoring
    questions_answered, questions_correct, overall_score = _compute_session_score(all_answers)
    reteach_count   = max(0, len(session.teaching_attempts) - 1)
    strategies_used = [t.strategy for t in session.teaching]

    current_teaching = next((t for t in session.teaching if t.is_current), None)
    teaching_summary = ""
    if current_teaching:
        teaching_summary = (
            f"Final teaching strategy: {current_teaching.strategy}\n"
            f"Key points covered: {', '.join((current_teaching.key_points or [])[:5])}"
        )

    subject, topic, concept = await _load_curriculum_chain(
        session.subject_id, session.topic_id, session.concept_id, db
    )

    answer_details = "\n".join(
        f"  Q{i+1}: Score {a.score}/100, Correct: {a.is_correct}"
        for i, a in enumerate(all_answers[:10])
    ) or "  No answers submitted."

    score_display = f"{overall_score}/100" if overall_score is not None else "N/A"

    system_prompt = (
        "You are an AI tutor generating a learning session summary. "
        "Be specific, constructive, and encouraging. Return JSON only."
    )
    prompt = f"""SESSION SUMMARY REQUEST
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}
Student familiarity: {session.student_familiarity} | Intent: {session.intent}

{teaching_summary}
Strategies used: {', '.join(strategies_used)}
Reteaching rounds: {reteach_count}
Questions answered (unique): {questions_answered}
Questions correct: {questions_correct}
Overall score (best-per-question): {score_display}

Answer breakdown:
{answer_details}

Generate a comprehensive session summary. Be specific to this concept and what the student demonstrated.

Return JSON:
{{
  "summary_text": "2–3 paragraph narrative summary of what the student learned and their performance.",
  "key_ideas": ["Key idea 1", "Key idea 2"],
  "strengths": ["What they understood well"],
  "areas_for_practice": ["What needs more work"],
  "recommended_next": "Brief recommendation for next study step",
  "teaching_methods_used": {strategies_used}
}}
"""
    try:
        raw, _ = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.6, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Summary generation failed: %s", exc)
        parsed = {
            "summary_text":    f"You completed a learning session on {concept.name}.",
            "key_ideas":       [],
            "strengths":       [],
            "areas_for_practice": [],
            "recommended_next":   None,
            "teaching_methods_used": strategies_used,
        }

    # Update final teaching attempt outcome
    if session.teaching_attempts:
        last_attempt = sorted(session.teaching_attempts, key=lambda a: a.attempt_number)[-1]
        if last_attempt.outcome is None:
            if overall_score is not None and overall_score >= 70:
                last_attempt.outcome = "completed"
            elif overall_score is not None and overall_score >= 50:
                last_attempt.outcome = "improved"
            else:
                last_attempt.outcome = "still_struggling"

    summary_fields = dict(
        summary_text         = _safe_str(parsed.get("summary_text")),
        key_ideas            = _safe_list(parsed.get("key_ideas")),
        strengths            = _safe_list(parsed.get("strengths")),
        areas_for_practice   = _safe_list(parsed.get("areas_for_practice")),
        recommended_next     = parsed.get("recommended_next"),
        teaching_methods_used= _safe_list(parsed.get("teaching_methods_used")),
        questions_answered   = questions_answered,
        questions_correct    = questions_correct,
        reteach_count        = reteach_count,
        overall_score        = overall_score,
    )

    if session.summary:
        for k, v in summary_fields.items():
            setattr(session.summary, k, v)
        summary = session.summary
    else:
        summary = AISessionSummary(session_id=session_id, **summary_fields)
        db.add(summary)

    await db.flush()

    await _add_message(
        session_id, "ai", "summary",
        summary.summary_text or "Session complete.",
        db,
    )

    if session.status not in ("completed", "abandoned"):
        session.status       = "completed"
        session.completed_at = _now()

    await db.commit()
    await db.refresh(summary)

    # Persist this completed AI-learning evidence into the existing progress
    # architecture. The operation is idempotent and never touches challenge
    # practice_score. Streak/activity is recorded through the same service used
    # by the rest of PeerUP.
    try:
        await progress_service.record_ai_learning_progress(
            db,
            user_id=user_id,
            topic_id=session.topic_id,
            overall_score=overall_score,
            completed_at=session.completed_at or _now(),
        )
        await db.commit()
        await progress_service.record_activity(db, user_id)
    except Exception as progress_exc:
        logger.warning("AI learning progress update failed (non-fatal): %s", progress_exc)

    return summary.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY EVENTS
# ─────────────────────────────────────────────────────────────────────────────

async def record_integrity_event(
    session_id: int, user_id: int, event_type: str, meta: Optional[dict], db: AsyncSession
) -> dict:
    await _get_session_owned(session_id, user_id, db)
    event = AISessionIntegrityEvent(
        session_id=session_id,
        event_type=event_type,
        occurred_at=_now(),
        meta=meta,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event.serialize()
