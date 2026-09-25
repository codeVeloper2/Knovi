"""AI Learning Session service for Knovi.

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
import uuid
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

# Single source of truth for math/Markdown output. This is injected into the
# SYSTEM message for every AI path that can produce learner-visible content.
_MATH_FORMATTING_SYSTEM = r"""
MATH + MARKDOWN OUTPUT CONTRACT (MANDATORY):
- The Learning Room renders Markdown and KaTeX. Never output raw LaTeX commands in normal prose.
- Inline mathematics MUST be wrapped in single-dollar delimiters: $...$.
- Display mathematics MUST be wrapped in double-dollar delimiters on their own lines: $$...$$.
- Valid examples: $c=3$, $5^3=125$, $\log_{5}(125)=3$, $\frac{a}{b}$, $\sqrt{x}$, $x\geq -2$.
- For logarithms, prefer explicit notation such as $\log_{5}(125)$ or $\log_{10}(100)$.
- Never emit malformed forms such as \\log2 16, \\log5 125, raw \\log_b a, ((10)), ((c)), or a formula with no KaTeX delimiters.
- Never put a trailing backslash after a formula. Never visibly double-escape LaTeX (for example \\log instead of \log).
- Use Markdown emphasis only outside math: **bold**, *italic*, and ==highlight==.
- Do not put ==...== inside a mathematical expression. Highlight the surrounding explanatory phrase instead.

WORKED CALCULATIONS (MANDATORY):
- Whenever you perform a step-by-step calculation, put the ENTIRE working inside a fenced block beginning with ```calculation and ending with ```.
- The UI renders that block as a dedicated CALCULATION card with an SVG copy icon. Do NOT write "Calculation", "Copy", "Copied", or a copy-button label yourself.
- Put exactly one meaningful mathematical step on each line.
- Every mathematical line MUST use valid KaTeX delimiters ($...$ or $$...$$).
- The final line may use ==Answer: $...$==.
- Example:
```calculation
$5^1 = 5$
$5^2 = 25$
$5^3 = 125$
==Answer: $c=3$==
```
- Do not use a generic code fence for mathematical working.
- Keep explanatory prose outside the calculation block.

GENERAL MATH SYNTAX:
- Fractions: $\frac{a}{b}$
- Powers/subscripts: $x^2$, $x_1$, $\log_{5}(125)$
- Roots: $\sqrt{x}$
- Inequalities: $x\geq -2$, $x<4$, $a\neq b$
- Greek letters: $\alpha$, $\theta$, $\pi$
- Multiplication: $\times$ or $\cdot$
- Sets: $x\in A$, $A\subseteq B$
- Sums/integrals: $\sum_{i=1}^{n} i$, $\int_0^1 x\,dx$
- Never rely on Markdown underscores/carets to render math; use KaTeX delimiters.
- If math appears inside JSON strings, preserve the same visible $...$ / $$...$$ delimiters.
"""

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
        "Use a brief diagnostic discussion only if useful, but do NOT present a formal quiz, numbered questions, answer choices, or a quiz block inside teaching. "
        "The formal compulsory quiz is opened separately by the Learning Room after an explicit readiness confirmation.",
    "custom":
        "Follow the student's specific request while staying within the curriculum concept.",
    "teach_it_back":
        "Feynman mode: after a brief orientation, ask the student to explain the idea back "
        "in their own words as if teaching a classmate. Evaluate their explanation for gaps, "
        "correct misconceptions, then invite them to try again until the core idea is solid. "
        "Do not open the formal quiz until they can explain the core idea reasonably.",
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
    r"^(?:yes|yeah|yep|sure|ready|i(?:[\'’]|\s*)m ready|let[\'’]?s do it|go ahead|okay|ok|absolutely|sounds good)(?:\s+(?:bro|please|now))?[.!\s]*$|"
    r"^(?:yes|yeah)[,.!]?\s+i(?:[\'’]|\s*)m ready(?:\s+(?:bro|please|now))?[.!\s]*$",
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
_TRANSITION_DECLINE_RE = re.compile(
    r"^(?:no|nope|not yet|not really|explain (?:it|that) again|please explain (?:it|that) again|i(?: still)? don['’]?t (?:get|understand) (?:it|that)|i need (?:more|another) explanation)[.!\s]*$",
    re.IGNORECASE,
)
_TRANSITION_CONFIRMATION_RE = re.compile(
    r"^(?:"
    r"yes[,\s]*i(?:[\'’]|\s*)m\s+ready\s+for\s+(?:the\s+)?next\s+task|"
    r"let[\'’]?s\s+(?:move|go)\s+(?:to\s+)?(?:task\s*\d+|the\s+next\s+task|next\s+task)|"
    r"(?:move|go)\s+(?:to\s+)?(?:task\s*\d+|the\s+next\s+task|next\s+task)|"
    r"next\s+task"
    r")(?:\s+please)?[.!\s]*$",
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


def _remove_embedded_quiz_from_teaching(text: str) -> str:
    """Keep formal assessment content out of the teaching message stream.

    The actual quiz is generated and rendered separately in Practice Mode. This
    defensive cleanup protects the UI if a provider ignores the prompt and
    returns a numbered question block anyway.
    """
    value = (text or "").strip()
    if not value:
        return value

    marker = re.search(r"(?im)^\s*(?:question\s*\d+|q\s*\d+)\s*[:.)-]", value)
    if marker:
        value = value[:marker.start()].rstrip()

    # Remove a trailing readiness/quiz invitation left immediately before an
    # accidentally embedded question block. Do not touch normal explanations.
    lines = value.splitlines()
    while lines and re.search(
        r"(?i)(?:quick\s+check|ready\s+to\s+(?:test|answer)|test\s+(?:what|your)\s+understanding)",
        lines[-1],
    ):
        lines.pop()
    return "\n".join(lines).strip() or "Teaching content is ready. Let's continue with the current learning task."


def _derive_learning_state(messages: list) -> dict:
    ordered = sorted(messages or [], key=lambda item: item.sequence)
    completed: set[int] = set()
    current = 0
    last_task_marker_seq = -1
    latest_transition = None
    latest_student_seq = -1
    latest_ai_seq = -1
    for message in ordered:
        if message.role == "student":
            latest_student_seq = max(latest_student_seq, message.sequence)
        if message.role == "ai":
            latest_ai_seq = max(latest_ai_seq, message.sequence)
        extra = message.extra or {}
        # Mastery is the canonical completion event for new Learning Room runs.
        if message.role == "ai" and (
            extra.get("masteryConfirmed") is True
            or (extra.get("taskCompleted") is True and extra.get("transitionConfirmed") is True and extra.get("masteryConfirmed") is not False)
        ):
            try:
                task_index = int(extra.get("taskIndex"))
                current_index = int(extra.get("currentTaskIndex"))
                if task_index >= 0 and current_index == task_index + 1:
                    completed.add(task_index)
            except (TypeError, ValueError):
                pass
        marker = extra.get("currentTaskIndex")
        if marker is None and message.message_type in ("teaching", "reteach", "timer_start"):
            marker = extra.get("taskIndex")
        if isinstance(marker, int) and marker >= 0 and message.sequence >= last_task_marker_seq:
            current = marker
            last_task_marker_seq = message.sequence
        if message.role == "ai" and extra.get("taskTransition") is True:
            latest_transition = (message.sequence, extra)
    waiting = bool(latest_transition and latest_transition[0] > latest_student_seq)
    next_index = None
    if waiting:
        try: next_index = int((latest_transition[1] or {}).get("nextTaskIndex"))
        except (TypeError, ValueError): next_index = None
    return {
        "currentTaskIndex": current,
        "completedTaskIndexes": sorted(completed),
        "waitingForTaskTransition": waiting,
        "nextTaskIndex": next_index,
        "latestAiSequence": latest_ai_seq,
    }


def _current_task_index_from_messages(messages: list) -> int:
    return int(_derive_learning_state(messages).get("currentTaskIndex", 0))


def _has_confirmed_task_transition(messages: list, target_task_index: int) -> bool:
    """Return True only when the immediately preceding task was explicitly completed.

    This is deliberately derived from persisted tutor messages instead of the
    model's latest action. A client/model cannot jump to Task N merely by saying
    "move to task N"; the prior task must have a passed practice result followed
    by an explicit transition confirmation.
    """
    if target_task_index <= 0:
        return True
    previous_index = target_task_index - 1
    for message in sorted(messages or [], key=lambda item: item.sequence, reverse=True):
        if message.role != "ai":
            continue
        extra = message.extra or {}
        try:
            task_index = int(extra.get("taskIndex", -1))
            current_index = int(extra.get("currentTaskIndex", -1))
        except (TypeError, ValueError):
            continue
        if (
            extra.get("taskCompleted") is True
            and extra.get("transitionConfirmed") is True
            and extra.get("masteryConfirmed") is True
            and task_index == previous_index
            and current_index == target_task_index
        ):
            return True
    return False


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


def _split_ai_response(content: str, *, max_chunks: int = 3, threshold: int = 520) -> list[str]:
    """Split long tutor responses into up to three natural chat messages.

    Short responses remain one message. Long responses prefer paragraph boundaries,
    then sentence boundaries, and finally hard chunks only as a last resort.
    """
    text = (content or "").strip()
    if len(text) <= threshold or max_chunks <= 1:
        return [text] if text else []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if len(paragraphs) <= max_chunks:
        return paragraphs

    # Greedily group paragraphs into balanced chunks.
    chunks: list[str] = []
    current = ""
    for p in paragraphs:
        candidate = f"{current}\n\n{p}" if current else p
        if current and len(candidate) > max(threshold, len(text) // max_chunks + 180) and len(chunks) < max_chunks - 1:
            chunks.append(current.strip())
            current = p
        else:
            current = candidate
    if current:
        chunks.append(current.strip())

    if len(chunks) <= max_chunks:
        return chunks

    # Sentence fallback for unusually dense prose.
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if len(sentences) >= 2:
        buckets = ["" for _ in range(max_chunks)]
        lengths = [0] * max_chunks
        for sentence in sentences:
            idx = min(range(max_chunks), key=lambda i: lengths[i])
            buckets[idx] = f"{buckets[idx]} {sentence}".strip()
            lengths[idx] += len(sentence)
        return [b for b in buckets if b]

    # Final bounded hard split.
    size = max(1, len(text) // max_chunks)
    return [text[i:i + size].strip() for i in range(0, len(text), size)][:max_chunks]


async def _add_ai_response(
    session_id: int,
    message_type: str,
    content: str,
    db: AsyncSession,
    *,
    extra: Optional[dict] = None,
) -> list[AISessionMessage]:
    """Persist a tutor response as 1–3 separate AI chat messages."""
    chunks = _split_ai_response(content) or [""]
    group_id = str(uuid.uuid4())
    created: list[AISessionMessage] = []
    base_extra = dict(extra or {})
    for index, chunk in enumerate(chunks):
        chunk_extra = {
            **base_extra,
            "responseGroupId": group_id,
            "responseChunkIndex": index,
            "responseChunkCount": len(chunks),
        }
        # Actions belong to the final chunk so the frontend never fires an
        # action before the tutor has finished delivering its response.
        if index < len(chunks) - 1:
            chunk_extra.pop("action", None)
            chunk_extra.pop("actionData", None)
        msg = await _add_message(session_id, "ai", message_type, chunk, db, extra=chunk_extra)
        created.append(msg)
    return created


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
    data["learningState"] = _derive_learning_state(all_messages)

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
        session_id, user_id, db, load_teaching=True, load_attempts=True, load_messages=True
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

    # Never allow the API caller (including the frontend) to jump forward.
    # Task N is teachable only after Task N-1 has been explicitly completed by
    # the persisted transition confirmation. This is the final server-side gate
    # even if an AI action or stale client state attempts to skip it.
    if task_index is not None and task_index > 0:
        if not _has_confirmed_task_transition(session.messages, task_index):
            raise HTTPException(409, "This Learning Plan task is locked until the previous task is passed and confirmed.")

        # The Next Task action is the canonical transition event. When the
        # client asks to teach the next task, make sure the persisted transition
        # itself also carries the completion marker. This keeps the backend
        # roadmap authoritative even if the preceding /message response was
        # stale or the client refreshed between the two calls.
        previous_task_index = task_index - 1
        for transition_msg in reversed(sorted(session.messages, key=lambda m: m.sequence)):
            extra = transition_msg.extra or {}
            if (
                transition_msg.role == "ai"
                and extra.get("taskTransition") is True
                and str(extra.get("nextTaskIndex")) == str(task_index)
            ):
                updated_extra = dict(extra)
                updated_extra.update({
                    "taskCompleted": True,
                    "taskIndex": previous_task_index,
                    "currentTaskIndex": task_index,
                    "transitionConfirmed": True,
                    "masteryConfirmed": True,
                })
                transition_msg.extra = updated_extra
                await db.flush()
                break

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

    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
        "You are an expert AI tutor for Knovi. Teach concepts clearly and adaptively. "
        "Teach like a real secondary-school teacher: check understanding, use questions, "
        "correct misconceptions quickly, and never rush to a test on empty confidence. "
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

FORMAL QUIZ SEPARATION (MANDATORY):
- Teaching content must NEVER contain a formal quiz, practice questions, numbered questions, answer choices, A/B/C/D options, or a "quick check" question.
- Do NOT end teaching by asking whether the student is ready for a quiz. The conversation agent handles readiness separately.
- Even when the student's intent is "quiz me", do not paste quiz questions into the teaching response. The Learning Room will open Practice Mode as a separate UI after readiness is confirmed.

IMPORTANT-POINT FORMATTING (MANDATORY):
- Use the highlight syntax `==...==` for the most important terms, definitions, rules, formulas, conclusions, or key phrases in the explanation. The Learning Room renders this syntax as a visible coloured background highlight while keeping the words fully readable.
- Use `**...**` only for ordinary emphasis; do not rely on bold alone to mark important points.
- Highlight short phrases or key terms, not entire paragraphs. Aim for a few meaningful highlights per response so they are useful for scanning.
- Never hide, replace, abbreviate, or omit the highlighted words.
- Do not put highlight markers around headings, whole paragraphs, tables, or code blocks.

READABLE RESPONSE LAYOUT (MANDATORY):
- Format the explanation for a student reading on a phone. Never return one giant wall of text.
- Use Markdown headings when introducing a distinct section, for example `### What this means`.
- Separate distinct paragraphs with a blank line (`\n\n`).
- When listing steps, examples, rules, or multiple points, use Markdown bullet lists (`- item`) or numbered lists (`1. item`).
- For worked calculations, put each meaningful step on its own line and use a blank line before the final answer.
- Keep sentences reasonably short and group related ideas into small paragraphs of about 2–4 sentences.
- Do not put the entire response into a single paragraph, even when the explanation is short.
- Markdown is allowed INSIDE the JSON string; encode newlines normally so the Learning Room can render them.


MATHEMATICS NOTATION (MANDATORY for any formula, equation, inequality, or symbol):
- Always wrap math in KaTeX delimiters so the Learning Room can render it.
- Inline math: $...$ e.g. $-3x > 12$, $\\frac{{a}}{{b}}$, $x^2$, $\\leq$, $\\geq$, $\\neq$, $\\sqrt{{x}}$, $\\alpha$.
- For logarithms, ALWAYS use delimiters around the complete expression: $\\log_2 16$, $\\log_5 125$, or $\\log_{{10}}(100)$.
- Never write raw LaTeX without delimiters. Never double-escape LaTeX in the visible answer (do not output `\\log` or `\\\frac`).
- Do not use `((...))` as a math delimiter. Use `$...$` instead.
- Display math on its own line: $$...$$ e.g. $$x = \\frac{{-b \\pm \\sqrt{{b^2-4ac}}}}{{2a}}$$
- Never write raw LaTeX without delimiters (wrong: \\frac{{1}}{{2}} alone). Always use $\\frac{{1}}{{2}}$.
- Prefer LaTeX for: inequalities, fractions, roots, exponents, greek letters, sums, integrals, sets.

MATHEMATICS TEACHING MODE:
- For Mathematics/General Mathematics/Mathematics-related topics, follow: explain idea → full worked example with steps → invite the student to try a SIMILAR problem in chat (guided practice) before any formal quiz.
- Show each calculation step on its own line and box the final answer clearly.
- When the worked example contains actual calculations, wrap the complete working in a fenced `calculation` block; do not rely only on a numbered list.
- When the student attempts a similar problem, check their working step-by-step and correct the first wrong step immediately.
- Do not ask only for verbal definitions when the skill is procedural. Formal Practice Mode still runs after micro-verification + readiness.

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
    explanation  = _remove_embedded_quiz_from_teaching(explanation)
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
    await _add_ai_response(
        session_id, "teaching", message_content, db,
        extra={
            "strategy": strategy,
            "teachingId": teaching.id,
            "provider": provider,
            "learningPlan": learning_tasks,
            "taskIndex": task_index,
            "currentTaskIndex": task_index if task_index is not None else _current_task_index_from_messages(session.messages),
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

    # Recover the current Learning Plan task from persisted server state.
    current_task_index = _current_task_index_from_messages(session.messages)

    # Count substantive exchanges so the AI can judge readiness
    teaching_exchange_count = sum(
        1 for m in session.messages
        if m.role == "student" and m.message_type not in ("welcome", "system")
    )

    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
        "You are an AI tutor on Knovi, a peer learning platform for students. "
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

IMPORTANT-POINT FORMATTING:
- For normal educational responses, use `==...==` around the most important terms, definitions, rules, formulas, or conclusions so the Learning Room can render them with a coloured background highlight.
- Use `**...**` only for ordinary emphasis. Keep highlights short and selective; never highlight an entire paragraph.
- Highlighted text must remain fully visible and readable.


MATHEMATICS NOTATION (MANDATORY for any formula, equation, inequality, or symbol):
- Always wrap math in KaTeX delimiters so the Learning Room can render it.
- Inline math: $...$ e.g. $-3x > 12$, $\\frac{{a}}{{b}}$, $x^2$, $\\leq$, $\\geq$, $\\neq$, $\\sqrt{{x}}$, $\\alpha$.
- For logarithms, ALWAYS use delimiters around the complete expression: $\\log_2 16$, $\\log_5 125$, or $\\log_{{10}}(100)$.
- Never write raw LaTeX without delimiters. Never double-escape LaTeX in the visible answer (do not output `\\log` or `\\\frac`).
- Do not use `((...))` as a math delimiter. Use `$...$` instead.
- Display math on its own line: $$...$$ e.g. $$x = \\frac{{-b \\pm \\sqrt{{b^2-4ac}}}}{{2a}}$$
- Never write raw LaTeX without delimiters (wrong: \\frac{{1}}{{2}} alone). Always use $\\frac{{1}}{{2}}$.
- Prefer LaTeX for: inequalities, fractions, roots, exponents, greek letters, sums, integrals, sets.

READABLE RESPONSE LAYOUT:
- Format normal tutor replies for a student reading on a phone. Avoid a single dense wall of text.
- Use short paragraphs separated by blank lines (`\n\n`).
- Use bullets or numbered steps when giving multiple points, instructions, or calculations.
- Use a heading when changing to a clearly different part of the explanation.
- For calculations, put meaningful steps on separate lines and make the final answer easy to spot.
- For any multi-step arithmetic, algebra, equation solving, or numerical working, use a fenced `calculation` block so the Learning Room renders the working in its dedicated calculation card:
```calculation
$2x + 4 = 10$
$2x = 6$
$x = 3$
==Answer: $x=3$==
```
- Do not put ordinary explanatory prose inside a calculation block. Use one mathematical step per line and keep the final line as the answer.

action field rules:
- null         → continue teaching/conversing normally
- "verify_understanding" → ask ONE short oral comprehension check (student explains in their own words). NOT a graded quiz. NOT multiple choice.
- "ask_readiness" → only AFTER a successful verify_understanding exchange; ask if ready for the formal quick check
- "start_quiz" → trigger Practice Mode only after the learner has explicitly confirmed readiness
- "mark_task_done" → only AFTER a quiz was passed (score ≥ 70); mark current task complete
- "next_task"  → only after the persisted transition prompt was shown AND the learner explicitly confirms readiness to move on
- "complete_session" → all tasks done and passed
- "guided_practice" → (Mathematics only) show a fully worked example, then give ONE similar problem for the student to attempt before formal quiz

SOCRATIC TEACHING (use deliberately):
- Do not always give the full answer immediately when the student asks something within the current task.
- Roughly 30–40% of the time when the student asks a conceptual question (and familiarity is not "new"), respond with a short guiding question first, then help them finish the idea.
- If the student is stuck or says they don't know, give a clear explanation — never trap them.

MICRO-VERIFICATION (critical for real learning):
- When the learner signals understanding ("I get it", "that makes sense", etc.), prefer action "verify_understanding" over jumping to readiness.
- The verify question must require the student to restate or apply the idea in their own words in 1–3 sentences.
- Only move to ask_readiness after a reasonable verify answer (or two soft attempts).

MATH GUIDED PRACTICE:
- For General Mathematics / Mathematics subjects, before formal quiz, use guided_practice: one worked example with clear steps, then one similar problem for the student to attempt in chat.

RESPONSE SEPARATION: If action is "ask_readiness" or "start_quiz", the response must be one short transition message only. NEVER include quiz questions, answer choices, or question lists in that response.

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
    valid_actions = {"ask_readiness", "start_quiz", "mark_task_done", "next_task", "complete_session", "verify_understanding", "guided_practice", "reteach_task"}
    if is_post_session or action not in valid_actions:
        action      = None
        action_data = None

    # Deterministic readiness gate: the learner must see a readiness question
    # before Practice Mode can begin. This protects the lifecycle even when a
    # model returns an over-eager start_quiz action.
    previous_ai = next(
        (m for m in reversed(sorted(session.messages, key=lambda m: m.sequence))
         if m.role == "ai" and m.message_type in ("teaching", "reteach", "practice")),
        None,
    )
    confirmation = bool(_READINESS_CONFIRMATION_RE.fullmatch(content.strip()))
    transition_confirmation = bool(_TRANSITION_CONFIRMATION_RE.fullmatch(content.strip()))
    previous_asked_readiness = bool(previous_ai and _READINESS_SIGNAL_RE.search(previous_ai.content or ""))
    previous_task_transition = bool(
        previous_ai
        and (previous_ai.extra or {}).get("taskTransition") is True
        and (previous_ai.extra or {}).get("nextTaskIndex") is not None
    )

    # Progression is server-authoritative. The model may suggest an action, but it
    # cannot skip the persisted quiz/transition gate. Most importantly, do not
    # allow the model's prose to say "Task 2" when the action was rejected.
    if action == "next_task" and not previous_task_transition:
        action = None
        action_data = None

    # A successful task completion is followed by an explicit transition question.
    # Accept natural confirmations such as "Let's move to task 2 please", but only
    # when that transition prompt actually exists in the persisted conversation.
    if previous_task_transition and (confirmation or transition_confirmation):
        next_task_index = int((previous_ai.extra or {}).get("nextTaskIndex"))
        action = "next_task"
        action_data = {"task_index": next_task_index, "reason": "The learner explicitly confirmed they are ready for the next Learning Plan task."}
        response_text = "Great — let’s move to the next part."
    elif _TRANSITION_DECLINE_RE.fullmatch(content.strip()) and previous_task_transition:
        action = "reteach_task"
        action_data = {"task_index": current_task_index, "reason": "The learner asked for the current task to be explained again before moving on."}
        response_text = "Absolutely. We’ll stay on this task and I’ll explain it another way before we move on."
    elif transition_confirmation and not previous_task_transition:
        # A learner cannot bypass a failed/unattempted compulsory check by
        # asking to move forward. After reteaching, invite them to take the
        # compulsory check again; before any pass, remain on the current task.
        action = "ask_readiness"
        action_data = {
            "task_index": current_task_index,
            "reason": "The current Learning Plan task must be passed before advancing.",
        }
        response_text = (
            "We still need to complete and pass the check for this Learning Plan task "
            "before moving on. Let’s stay here and make sure you’re ready to try the check again."
        )
    elif confirmation and previous_asked_readiness:
        action = "start_quiz"
        action_data = {"task_index": current_task_index, "reason": "The learner explicitly confirmed readiness."}
        # Do not let the model paste the quiz into the conversation. The frontend
        # opens the actual Practice Mode UI immediately after this message.
        response_text = "Great — I’ll open the quick check now."
    elif action == "start_quiz":
        action = "ask_readiness"
        action_data = {"reason": "The learner needs to explicitly confirm readiness before practice."}
        response_text = "You've covered enough for a quick check. Are you ready to test what you understand?"
    elif action == "ask_readiness":
        prior_verify_pass = any(
            (m.extra or {}).get("verifyPassed") is True
            and (m.extra or {}).get("taskIndex") == current_task_index
            for m in session.messages if m.role == "ai"
        )
        if not prior_verify_pass:
            action = "verify_understanding"
            action_data = {"task_index": current_task_index, "reason": "Micro-verification required before readiness."}
            response_text = (
                "Before we test formally, tell me in your own words what the key idea of this task is. "
                "A short explanation is enough."
            )
        else:
            response_text = "You've covered enough for a quick check. Are you ready to test what you understand?"
    elif action is None and _UNDERSTANDING_SIGNAL_RE.search(content or ""):
        # Real teachers verify understanding before testing.
        action = "verify_understanding"
        action_data = {"task_index": current_task_index, "reason": "Learner indicated understanding; verify before readiness."}
        response_text = (
            "Good — before the formal check, explain the main idea of this task in your own words "
            "in one or two sentences. What does it mean, and how would you use it?"
        )
    # Evaluate micro-verification answers (oral comprehension, not graded quiz).
    previous_verify = bool(
        previous_ai
        and (
            (previous_ai.extra or {}).get("verifyUnderstanding") is True
            or (previous_ai.extra or {}).get("action") == "verify_understanding"
            or action == "verify_understanding" and False
        )
    )
    if previous_ai and (previous_ai.extra or {}).get("verifyUnderstanding") is True and not confirmation:
        # Student is answering the oral check — evaluate lightly with the model response already generated,
        # but enforce progression: weak → keep teaching; reasonable → ask readiness.
        verify_prompt = f"""You are checking whether a student roughly understands the current learning task.
TASK INDEX: {current_task_index}
STUDENT EXPLANATION: {content}

Return JSON only:
{{"passed": true/false, "feedback": "1-2 sentences", "correction": "brief correction if failed, else null"}}
Passed means the explanation is roughly on-topic and shows partial or better understanding — not perfection.
"""
        try:
            vraw, _ = await call_with_fallback(
                verify_prompt,
                system=_MATH_FORMATTING_SYSTEM + "\nYou are a fair teacher doing a quick oral check. Return JSON only.",
                temperature=0.2,
                json_mode=True,
            )
            vparsed = parse_json(vraw)
        except Exception:
            vparsed = {"passed": len(content.strip()) >= 20, "feedback": "Thanks for explaining.", "correction": None}
        passed = bool(vparsed.get("passed"))
        if passed:
            action = "ask_readiness"
            action_data = {"task_index": current_task_index, "reason": "Micro-verification passed.", "verifyPassed": True}
            response_text = (
                f"{_safe_str(vparsed.get('feedback'), 'Solid explanation.')} "
                "Are you ready for a short formal check on this task?"
            )
        else:
            action = None
            action_data = {"verifyPassed": False, "task_index": current_task_index}
            correction = _safe_str(vparsed.get("correction") or vparsed.get("feedback"), "Let's tighten the idea.")
            response_text = (
                f"{correction}\n\nI'll keep teaching this point, then we'll try the oral check again."
            )

    next_task_index = (
        int(action_data.get("task_index"))
        if action == "next_task"
        and isinstance(action_data, dict)
        and str(action_data.get("task_index", "")).isdigit()
        else None
    )

    # Passing the quiz is not itself task completion. The learner's explicit
    # confirmation of the transition is the canonical completion event.
    previous_completed_task_index = (
        next_task_index - 1
        if next_task_index is not None
        else None
    )

    response_extra = {
        "provider": provider,
        "inResponseTo": content[:100],
        "suggestNewSession": suggest_new_session,
        "detectedSubject": detected_subject,
        "detectedTopic": detected_topic,
        "sessionNote": session_note,
        "action": action,
        "actionData": action_data,
        "currentTaskIndex": next_task_index if next_task_index is not None else current_task_index,
        "taskIndex": current_task_index,
    }
    if action == "verify_understanding":
        response_extra["verifyUnderstanding"] = True
    if isinstance(action_data, dict) and action_data.get("verifyPassed") is True:
        response_extra["verifyPassed"] = True
        response_extra["verifyUnderstanding"] = True
    if action == "ask_readiness" and isinstance(action_data, dict) and action_data.get("verifyPassed"):
        response_extra["verifyPassed"] = True
    if previous_completed_task_index is not None:
        response_extra.update({
            "taskCompleted": True,
            "taskIndex": previous_completed_task_index,
            "transitionConfirmed": True,
            "masteryConfirmed": True,
        })
    created = await _add_ai_response(session_id, "teaching", response_text, db, extra=response_extra)
    await db.commit()
    for msg in created:
        await db.refresh(msg)
    return created[-1].serialize()


async def create_idle_nudge(session_id: int, user_id: int, db: AsyncSession, nudge_number: int) -> dict:
    session = await _get_session_owned(session_id, user_id, db, load_messages=True)
    if session.status not in ("teaching", "reteaching"):
        raise HTTPException(409, "Idle nudges are only available during active teaching.")
    if nudge_number not in (1, 2):
        raise HTTPException(400, "Only two idle nudges are allowed per idle period.")
    ordered = sorted(session.messages, key=lambda m: m.sequence)
    latest_ai = next((m for m in reversed(ordered) if m.role == "ai"), None)
    latest_student = next((m for m in reversed(ordered) if m.role == "student"), None)
    if not latest_ai or (latest_student and latest_student.sequence >= latest_ai.sequence):
        raise HTTPException(409, "The learner has already replied.")
    already = [m for m in ordered if m.role == "ai" and (m.extra or {}).get("idleNudgeNumber") == nudge_number]
    if already:
        return already[-1].serialize()
    task_index = _current_task_index_from_messages(ordered)

    # Build context from recent messages so the AI can personalise the nudge
    recent_msgs = ordered[-6:] if len(ordered) >= 6 else ordered
    context_lines = []
    for m in recent_msgs:
        role_label = "Tutor" if m.role == "ai" else "Student"
        snippet = (m.content or "")[:200]
        context_lines.append(f"{role_label}: {snippet}")
    context_snippet = "\n".join(context_lines)

    # Load the concept name from the curriculum chain (session model has no concept_name field)
    try:
        _, _, concept_obj = await _load_curriculum_chain(
            session.subject_id, session.topic_id, session.concept_id, db
        )
        concept_name = concept_obj.name or ""
    except Exception:
        concept_name = ""
    nudge_prompt = (
        f"You are KnoAI, a warm and encouraging AI tutor.\n"
        f"The student has gone quiet after your last message. Write a short friendly nudge (1-2 sentences max).\n\n"
        f"Recent conversation:\n{context_snippet}\n\n"
        f"Concept being taught: {concept_name}\n"
        f"This is nudge {nudge_number} of 2.\n\n"
        "Rules:\n"
        "- Nudge 1: gently check they are still there, invite a reply or question. Warm, not pushy.\n"
        "- Nudge 2: acknowledge they may need more time, offer to approach it differently. Brief.\n"
        "- Do NOT repeat teaching content. No markdown. No bullet points.\n"
        "- Return ONLY the nudge message text, nothing else."
    )
    try:
        # json_mode=False: nudge is plain text — JSON mode causes Gemini to wrap
        # the response in a JSON object instead of returning the message directly.
        content, _ = await call_with_fallback(nudge_prompt, temperature=0.8, json_mode=False)
        content = content.strip().strip('"').strip()
        if not content:
            raise ValueError("empty nudge response")
    except Exception as exc:
        logger.warning("Nudge AI call failed (session %s, nudge %s): %s", session_id, nudge_number, exc)
        content = (
            "I haven’t seen your reply yet — are you still with me? Take your time, "
            "and feel free to ask me to explain it a different way."
            if nudge_number == 1 else
            "No rush at all, I’m still here. If anything feels unclear, just let me know "
            "and I’ll try coming at it from a different angle."
        )

    msg = await _add_message(
        session_id, "ai", "idle_nudge", content, db,
        extra={"idleNudgeNumber": nudge_number, "currentTaskIndex": task_index, "taskIndex": task_index},
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
        session_id, user_id, db, load_messages=True, load_teaching=True
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

    # The quiz is scoped to the current Learning Plan task, not the whole concept.
    plan: list[dict] = []
    for teaching in session.teaching:
        try:
            candidate = parse_json(teaching.raw_content or "{}").get("learning_tasks")
            if isinstance(candidate, list) and candidate:
                plan = candidate
                break
        except Exception:
            pass
    if task_index is None:
        task_index = _current_task_index_from_messages(session.messages)
    if task_index < 0 or task_index >= len(plan):
        raise HTTPException(400, "Invalid Learning Plan task for this practice run.")
    selected_task = plan[task_index]
    allowed_objectives = selected_task.get("objectiveIds") or selected_task.get("objective_ids") or []
    allowed_objectives = [int(x) for x in allowed_objectives if str(x).isdigit()]
    current_teaching = current_teaching or await _get_current_teaching(session_id, db)
    teaching_summary = (
        f"Task {task_index + 1}: {selected_task.get('title', 'Current task')}\n"
        f"Task description: {selected_task.get('description', '')}\n"
        f"Task focus: {selected_task.get('focus', '')}\n"
        f"Task objective IDs: {allowed_objectives}\n"
        f"Teaching explanation:\n{current_teaching.explanation or ''}\n"
        f"Key points: {', '.join(current_teaching.key_points or [])}\n"
        f"Examples covered: {', '.join((current_teaching.examples or [])[:5])}\n"
        f"Worked examples: {', '.join((current_teaching.worked_examples or [])[:3])}"
    )
    future_tasks = "\n".join(
        f"- Task {i + 1}: {t.get('title', '')} — {t.get('description', '')}"
        for i, t in enumerate(plan) if i != task_index
    ) or "(none)"

    # Delayed retention: once the learner reaches Task 2+, the first question
    # revisits the previously mastered task. This is deliberately one small
    # retrieval item, not a second full quiz.
    retention_summary = ""
    if task_index > 0:
        previous_task_index = task_index - 1
        previous_teaching = None
        for message in reversed(sorted(session.messages, key=lambda m: m.sequence)):
            if message.role == "ai" and (message.extra or {}).get("taskIndex") == previous_task_index:
                teaching_id = (message.extra or {}).get("teachingId")
                if teaching_id:
                    previous_teaching = next((t for t in session.teaching if t.id == teaching_id), None)
                    if previous_teaching:
                        break
        if previous_teaching:
            previous_task = plan[previous_task_index]
            retention_summary = f"""
RETENTION MATERIAL — ONLY FOR Q1
Previous mastered task: Task {previous_task_index + 1}: {previous_task.get('title', '')}
Previous focus: {previous_task.get('focus', '')}
Previous teaching explanation: {previous_teaching.explanation or ''}
Previous key points: {', '.join(previous_teaching.key_points or [])}
Previous worked examples: {', '.join((previous_teaching.worked_examples or [])[:3])}
"""

    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
        "You are an expert AI tutor generating a compulsory retrieval quiz. "
        "The quiz is strictly scoped to the CURRENT Learning Plan task. "
        "Do not test future tasks or generic curriculum knowledge. Return JSON only."
    )
    prompt = f"""CURRICULUM CONTEXT
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}

CURRENT LEARNING PLAN TASK
{teaching_summary}
{retention_summary}

FUTURE/OTHER TASKS — FORBIDDEN IN THIS QUIZ (except the explicitly scoped prior-task Q1 retention check)
{future_tasks}

Generate exactly {count} retrieval/practice questions. This is a mastery loop, not a 3-question quiz.
For Task 1, every question must test ONLY the current task. For Task 2+, Q1 is a DELAYED RETENTION CHECK
using ONLY the RETENTION MATERIAL below; Q2 onward must test ONLY the current task. The retention
question must not introduce new material. Current-task facts may be used only if taught in the current
task material or directly reasoned from it.
For a 5-question run use this progression:
- Q1 guided_practice: straightforward application + a useful answer-neutral hint.
- Q2 guided_practice: different example/context + a useful hint.
- Q3 independent_practice: no scaffolding; hint only recalls the method.
- Q4 independent_practice: new problem requiring independent application.
- Q5 transfer: slightly unfamiliar but directly grounded application.
If count is smaller, preserve this progression as far as possible. Do NOT introduce terminology, procedures, formulas, or
applications that belong to another task. In particular, merely appearing in the broader concept
or curriculum does not make a fact testable here.

ASSESSMENT FORMAT BY SUBJECT:
- For Mathematics, General Mathematics, Further Mathematics, or another mathematics subject,
  do NOT use oral/definition-style questions as the compulsory assessment. Use calculation,
  worked-problem, numerical multiple-choice, or closely related mathematical application questions.
  The learner should demonstrate the mathematical skill by calculating/solving, not merely saying
  what a term means. If a definition matters, it may appear as context for a calculation, but it
  should not be the main oral question.
- For non-mathematics subjects, choose question types that fit the task and may include short_answer
  or explanation when appropriate.

Do NOT reveal the answer in the question text.

Return JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "question_type": "short_answer|multiple_choice|calculation|explanation|true_false|application",
      "options": null,
      "expected_answer": "Model answer for AI evaluation only",
      "rubric": "What to look for when marking",
      "stage": "retention|guided_practice|independent_practice|transfer",
      "skill": "understanding|application|accuracy|independence|transfer",
      "hint": "A concise answer-neutral hint that helps the learner recall the method without revealing the answer."
    }}
  ]
}}

For multiple_choice: options must be [{{"label":"A","text":"..."}}, ...] and expected_answer MUST be exactly the correct option label.
"""
    try:
        raw, _ = await call_with_fallback(
            prompt, system=system_prompt, temperature=0.45, json_mode=True
        )
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Question generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")

    # Second-pass scope gate: reject questions that test content outside the
    # current task. Prefer targeted regeneration over failing the whole quiz.
    raw_questions = _safe_list(parsed.get("questions"))
    if not raw_questions:
        raise HTTPException(502, "AI returned no questions.")
    if len(raw_questions) < count:
        raise HTTPException(502, f"The tutor returned only {len(raw_questions)} of {count} required mastery questions.")

    def _scope_verify_prompt(questions_payload: list) -> str:
        return f"""You are a strict curriculum assessment validator.
CURRENT TASK MATERIAL:
{teaching_summary}
{retention_summary}

FORBIDDEN OTHER TASKS (do not test these as the main skill):
{future_tasks}

QUESTIONS TO VALIDATE:
{json.dumps(questions_payload, ensure_ascii=False)}

Rules:
- Accept a question if a careful student can answer it from the CURRENT TASK MATERIAL (and for Task 2+ Q1 only, the RETENTION MATERIAL) plus ordinary reasoning.
- Reject only when the question mainly tests a skill, formula, or procedure that belongs to a different Learning Plan task and is not taught in the allowed material.
- Shared topic vocabulary (e.g. the concept name appearing in several task titles) is NOT by itself a scope violation.
- When unsure, prefer valid=true if the question is a reasonable check of the current task.

Return JSON only: {{"valid": true|false, "invalid_indexes": [0,1], "reason": "brief reason"}}
"""

    async def _validate_scope(questions_payload: list) -> tuple[bool, list[int], str]:
        verify_raw, _ = await call_with_fallback(
            _scope_verify_prompt(questions_payload),
            system=_MATH_FORMATTING_SYSTEM + "\n" + (
                "You are an assessment-scope checker. Reject only clear future-task or "
                "untaught leakage. Shared topic wording alone is not a violation."
            ),
            temperature=0.1,
            json_mode=True,
        )
        verification = parse_json(verify_raw)
        invalid = verification.get("invalid_indexes") or []
        invalid_indexes = [
            int(i) for i in invalid
            if str(i).isdigit() and 0 <= int(i) < len(questions_payload)
        ]
        reason = _safe_str(verification.get("reason"), "")
        is_valid = bool(verification.get("valid", False)) and not invalid_indexes
        return is_valid, invalid_indexes, reason

    try:
        is_valid, invalid_indexes, scope_reason = await _validate_scope(raw_questions)
        if not is_valid:
            logger.warning(
                "Quiz scope rejected (session=%s task=%s): %s indexes=%s",
                session_id, task_index, scope_reason, invalid_indexes,
            )
            # Regenerate with concrete feedback from the validator.
            feedback = scope_reason or "Previous questions left the allowed task scope."
            bad = ", ".join(str(i + 1) for i in invalid_indexes) or "one or more items"
            raw2, _ = await call_with_fallback(
                prompt + (
                    f"\nIMPORTANT SCOPE FIX: {feedback}\n"
                    f"Regenerate the full set of {count} questions. "
                    f"Questions that failed were roughly Q{bad}. "
                    "Q1 on Task 2+ may be the single prior-task retention check; "
                    "all other questions must stay strictly inside the CURRENT task. "
                    "Do not assess future-task concepts."
                ),
                system=system_prompt, temperature=0.2, json_mode=True,
            )
            parsed = parse_json(raw2)
            raw_questions = _safe_list(parsed.get("questions"))
            if len(raw_questions) < count:
                raise HTTPException(
                    502,
                    f"The tutor returned only {len(raw_questions)} of {count} required mastery questions.",
                )

            is_valid2, invalid_indexes2, scope_reason2 = await _validate_scope(raw_questions)
            if not is_valid2:
                # Keep in-scope items and refill only the gaps instead of
                # failing the learner's practice attempt entirely.
                kept = [
                    q for i, q in enumerate(raw_questions)
                    if i not in set(invalid_indexes2)
                ]
                need = max(0, count - len(kept))
                logger.warning(
                    "Quiz scope still partial (session=%s task=%s): kept=%s need=%s reason=%s",
                    session_id, task_index, len(kept), need, scope_reason2,
                )
                if need > 0:
                    refill_prompt = f"""CURRICULUM CONTEXT
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}

CURRENT LEARNING PLAN TASK
{teaching_summary}

Generate exactly {need} retrieval/practice questions that test ONLY this current task.
Do not test future Learning Plan tasks. Prefer calculation/application for mathematics.
Previous scope failure reason: {scope_reason2 or scope_reason or "out of scope"}

Return JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "question_type": "short_answer|multiple_choice|calculation|explanation|true_false|application",
      "options": null,
      "expected_answer": "Model answer for AI evaluation only",
      "rubric": "What to look for when marking",
      "stage": "guided_practice|independent_practice|transfer",
      "skill": "understanding|application|accuracy|independence|transfer",
      "hint": "A concise answer-neutral hint."
    }}
  ]
}}
"""
                    raw3, _ = await call_with_fallback(
                        refill_prompt,
                        system=system_prompt,
                        temperature=0.25,
                        json_mode=True,
                    )
                    refilled = _safe_list(parse_json(raw3).get("questions"))
                    # Light-check the refill; drop any that still fail.
                    if refilled:
                        ok_refill, bad_refill, _ = await _validate_scope(refilled)
                        if ok_refill:
                            kept.extend(refilled)
                        else:
                            kept.extend(
                                q for i, q in enumerate(refilled)
                                if i not in set(bad_refill)
                            )
                raw_questions = kept[:count]
                if len(raw_questions) < max(1, min(2, count)):
                    raise HTTPException(
                        502,
                        "The tutor could not produce a quiz safely scoped to the current Learning Plan task.",
                    )
                # Pad short sets only if we still have at least one solid item:
                # better a shorter in-scope check than blocking practice entirely.
                parsed = {"questions": raw_questions}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Quiz scope validation failed closed: %s", exc)
        raise HTTPException(502, "The tutor could not verify that the quiz is scoped to the current Learning Plan task.")

    raw_questions = _safe_list(parsed.get("questions"))
    if not raw_questions:
        raise HTTPException(502, "AI returned no questions.")
    # After scope filtering we may have fewer than `count` items. Prefer a
    # shorter in-scope practice run over blocking the learner entirely.
    if len(raw_questions) < 1:
        raise HTTPException(502, "AI returned no questions.")

    # Second-pass answer-quality gate. Scope validation alone is not enough:
    # a question can be about the right topic while its expected answer is
    # logically inconsistent with the wording. This matters especially for
    # mathematics, where phrases such as "at most", "not full", "strictly
    # less than", and "at least" can describe different constraints in one
    # scenario. Reject ambiguous or self-contradictory items before they reach
    # the learner.
    try:
        quality_prompt = f"""You are a strict assessment-quality validator.
CURRENT TASK MATERIAL:
{teaching_summary}
{retention_summary}

QUESTIONS TO VALIDATE:
{json.dumps(raw_questions, ensure_ascii=False)}

For every question, independently solve it from its exact wording and compare
that solution with expected_answer, options, and rubric. Do not assume the
expected answer is correct. For mathematics, pay close attention to the exact
logical condition described by the wording. Distinguish a general rule or
capacity from the current state when the question explicitly describes both.
For example, "at most 8" gives p <= 8, while "currently not full" gives p < 8.
If a question combines those phrases, the requested current state must be
represented rather than silently replacing it with the general capacity rule.

Reject a question if its expected answer is wrong, its options contain no
correct answer, the wording permits two materially different answers, the rubric
contradicts the question, or the question requires an unstated condition.
Return JSON only:
{{"valid": true|false, "invalid_indexes": [0,1], "reason": "brief concrete reason"}}
"""
        quality_raw, _ = await call_with_fallback(
            quality_prompt,
            system=_MATH_FORMATTING_SYSTEM + "\nYou are a strict assessment-quality checker. Never approve a mathematically incorrect or ambiguous item.",
            temperature=0.0,
            json_mode=True,
        )
        quality = parse_json(quality_raw)
        if not bool(quality.get("valid", False)):
            raw2, _ = await call_with_fallback(
                prompt + "\
IMPORTANT ASSESSMENT-QUALITY RULE: Each question and expected answer must be logically consistent with the exact wording. For mathematics, explicitly distinguish the rule/limit from the current state described in the scenario. Do not create an item whose wording supports one inequality while expected_answer/rubric claims another. Regenerate the full set.",
                system=system_prompt, temperature=0.15, json_mode=True
            )
            parsed = parse_json(raw2)
            raw_questions = _safe_list(parsed.get("questions"))
            if not raw_questions:
                raise HTTPException(502, "The tutor could not produce a complete, high-quality mastery assessment.")

            quality_prompt2 = f"""You are a strict assessment-quality validator.
CURRENT TASK MATERIAL:
{teaching_summary}
{retention_summary}

REGENERATED QUESTIONS:
{json.dumps(raw_questions, ensure_ascii=False)}

Independently solve every item from its exact wording. Reject any item whose
expected answer, options, or rubric is wrong or inconsistent. For mathematics,
carefully distinguish current-state constraints from general rules/capacities
and do not add unstated conditions. Return JSON only:
{{"valid": true|false, "invalid_indexes": [0,1], "reason": "brief concrete reason"}}
"""
            quality_raw2, _ = await call_with_fallback(
                quality_prompt2,
                system=_MATH_FORMATTING_SYSTEM + "\nYou are a strict assessment-quality checker. Never approve a mathematically incorrect or ambiguous item.",
                temperature=0.0,
                json_mode=True,
            )
            quality2 = parse_json(quality_raw2)
            if not bool(quality2.get("valid", False)):
                bad = quality2.get("invalid_indexes") or []
                bad_set = {
                    int(i) for i in bad
                    if str(i).isdigit() and 0 <= int(i) < len(raw_questions)
                }
                kept_q = [q for i, q in enumerate(raw_questions) if i not in bad_set]
                if kept_q:
                    logger.warning(
                        "Quality gate partial accept (session=%s): kept=%s dropped=%s reason=%s",
                        session_id, len(kept_q), len(bad_set), quality2.get("reason"),
                    )
                    raw_questions = kept_q
                else:
                    raise HTTPException(502, "The tutor could not produce a logically consistent mastery assessment.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Quiz quality validation failed closed: %s", exc)
        raise HTTPException(502, "The tutor could not verify that the mastery assessment is logically consistent.")

    # Deterministic guard for obvious future-task leakage. Ignore phrases that
    # also appear in the current task text so shared concept wording (e.g.
    # "linear inequalities") does not block an otherwise valid quiz.
    current_blob = " ".join(
        _safe_str(selected_task.get(k), "") for k in ("title", "focus", "description")
    ).lower()
    current_blob = re.sub(r"[^a-z0-9 ]+", " ", current_blob)
    current_blob = re.sub(r"\s+", " ", current_blob).strip()

    forbidden_phrases: list[str] = []
    for i, other_task in enumerate(plan):
        if i == task_index or not isinstance(other_task, dict):
            continue
        for key in ("title", "focus", "description"):
            value = _safe_str(other_task.get(key), "")
            normalized = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
            normalized = re.sub(r"\s+", " ", normalized).strip()
            if len(normalized.split()) >= 2 and normalized not in current_blob:
                forbidden_phrases.append(normalized)
    filtered_questions: list = []
    for qi, q in enumerate(raw_questions):
        # Q1 on later tasks is the delayed-retention question and may reference
        # the immediately previous mastered task.
        if task_index > 0 and qi == 0:
            filtered_questions.append(q)
            continue
        q_text = _safe_str(q.get("question"), "").lower()
        normalized_q = re.sub(r"[^a-z0-9 ]+", " ", q_text)
        normalized_q = re.sub(r"\s+", " ", normalized_q).strip()
        if any(phrase in normalized_q for phrase in forbidden_phrases):
            logger.warning(
                "Dropping question that references another Learning Plan task (session=%s)",
                session_id,
            )
            continue
        filtered_questions.append(q)
    raw_questions = filtered_questions
    if not raw_questions:
        raise HTTPException(502, "The tutor generated a question that references another Learning Plan task.")

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
        # Stage is server-assigned so the AI cannot accidentally turn a
        # mastery run into five identical easy questions.
        if task_index > 0 and i == 1:
            stage = "retention"
        elif (i - (1 if task_index > 0 else 0)) <= 2:
            stage = "guided_practice"
        elif (i - (1 if task_index > 0 else 0)) <= 4:
            stage = "independent_practice"
        else:
            stage = "transfer"
        skill = _safe_str(q.get("skill"), "application")
        obj = AISessionQuestion(
            session_id=session_id,
            question=_safe_str(q.get("question"), "Question unavailable."),
            question_type=qtype,
            options=q.get("options") if qtype == "multiple_choice" else None,
            expected_answer=_safe_str(q.get("expected_answer")),
            rubric=_safe_str(q.get("rubric")),
            hint=_safe_str(q.get("hint")),
            stage=stage,
            skill=skill,
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
    used_hint: bool = False,
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
    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
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
  "correction_note": "If understanding is weak or partial: 80-120 words correcting the specific misconception RIGHT NOW, with the key idea restated simply. If strong: null.",
  "misconception": "Identified misconception if any, or null",
  "needs_reteach": true or false,
  "recommended_strategy": "suggested reteaching strategy if needs_reteach is true, or null",
  "dimensions": {{"understanding": 0-100, "skill_application": 0-100, "accuracy": 0-100, "independence": 0-100, "consistency": 0-100}}
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
    # The evaluator may suggest reteaching, but the lifecycle must not make
    # reteaching mandatory merely because the model returned a conservative
    # flag. A solid answer (70+) should not trigger reteaching.
    #
    # Policy:
    #   - < 50 or explicitly weak -> reteach
    #   - 50-69 partial -> reteach
    #   - 70+ -> no reteach for this answer
    # This keeps the compulsory check from turning into a compulsory reteach.
    needs_reteach = False

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

    # The learning-room policy is explicit: the score is authoritative for the
    # reteach gate, with "weak" understanding also treated as a real signal.
    # A model-provided needs_reteach=true cannot override a 70+ answer.
    if score_val is not None and score_val < 50:
        needs_reteach = True
        if understanding == "strong":
            understanding = "weak"
    elif understanding == "weak":
        needs_reteach = True
    elif understanding == "partial" and score_val is not None and score_val < 70:
        needs_reteach = True
    else:
        needs_reteach = False

    answer.is_correct    = bool(parsed.get("is_correct")) if parsed.get("is_correct") is not None else (score_val is not None and score_val >= 70)
    answer.score         = score_val
    answer.feedback      = _safe_str(parsed.get("feedback"))
    # Associate the answer with the learning task that was active when its timer started.
    task_index = None
    msg_result = await db.execute(
        select(AISessionMessage)
        .where(
            AISessionMessage.session_id == session_id,
            AISessionMessage.message_type.in_(("timer_start", "teaching", "reteach")),
        )
        .order_by(AISessionMessage.sequence.desc())
        .limit(1)
    )
    latest_task_message = msg_result.scalar_one_or_none()
    if latest_task_message and latest_task_message.extra:
        value = latest_task_message.extra.get("taskIndex")
        if isinstance(value, int) and value >= 0:
            task_index = value

    raw_dims = parsed.get("dimensions") if isinstance(parsed.get("dimensions"), dict) else {}
    def _dim(name: str, fallback: int) -> int:
        value = _safe_int(raw_dims.get(name), 0, 100)
        return fallback if value is None else value
    # Keep the evaluator's dimensions, but ensure every dimension has a safe
    # deterministic fallback from the actual scored response.
    # Independence is not merely an AI opinion: using a hint is observable
    # evidence of support. A hinted response can still be correct, but it cannot
    # receive full independence credit.
    base_independence = _dim("independence", score_val or 0)
    if used_hint:
        base_independence = min(base_independence, 65 if question.stage == "guided_practice" else 70)
    dimensions = {
        "understanding": _dim("understanding", score_val or 0),
        "skill_application": _dim("skill_application", score_val or 0),
        "accuracy": _dim("accuracy", score_val or 0),
        "independence": base_independence,
        "consistency": _dim("consistency", score_val or 0),
    }

    answer.ai_evaluation = {
        "understanding":        understanding,
        "dimensions":            dimensions,
        "usedHint":              used_hint,
        "stage":                 question.stage,
        "skill":                 question.skill,
        "misconception":        parsed.get("misconception"),
        "needsReteach":         needs_reteach,
        "recommendedStrategy":  parsed.get("recommended_strategy"),
        "provider":             provider,
        "taskIndex":             task_index,
    }

    # The task index is persisted with the evaluated answer so practice completion
    # can recover the correct Learning Plan item even without a timer.

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

    # Keep the entire compulsory practice run in Practice Mode.
    # A weak/partial answer must NOT switch the session to reteaching before
    # the remaining questions are answered. The completed run decides whether
    # adaptive reteaching is needed.
    if session.status == "retrieval":
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

    correction_note = None
    if understanding in ("weak", "partial"):
        correction_note = _safe_str(parsed.get("correction_note")) or None
        if not correction_note and answer.feedback:
            # Fallback: use first part of feedback as immediate correction
            correction_note = answer.feedback[:400]
        if correction_note:
            await _add_message(
                session_id, "ai", "feedback",
                f"**Quick correction**\n\n{correction_note}",
                db,
                extra={
                    "questionId": question_id,
                    "answerId": answer.id,
                    "correctionNote": True,
                    "understanding": understanding,
                },
            )

    result = {
        **answer.serialize(),
        "understanding":       understanding,
        "needsReteach":        needs_reteach,
        "misconception":       parsed.get("misconception"),
        "recommendedStrategy": parsed.get("recommended_strategy"),
        "dimensions":          dimensions,
        "usedHint":            used_hint,
        "stage":               question.stage,
        "skill":               question.skill,
        "question":            question.question,
        "questionType":        question.question_type,
        "options":             question.options,
        "correctAnswer":       question.expected_answer if question.question_type != "multiple_choice" else None,
        "correctOptionLabel":  _correct_option_label(question),
        "taskIndex":           task_index,
        "correctionNote":      correction_note,
    }
    return result


async def complete_practice_run(
    session_id: int, user_id: int, question_ids: list[int], db: AsyncSession
) -> dict:
    """Close the current practice run and persist its server-authoritative outcome.

    Passing a quiz creates the persisted transition prompt, but does NOT mark
    the task complete yet. Completion is recorded only when the learner
    explicitly confirms readiness for the next Learning Plan task.
    """
    session = await _get_session_owned(
        session_id, user_id, db, load_messages=True, load_teaching=True
    )
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

    # Mastery is deliberately stricter than the old 3-question pass gate.
    current_answers = [a for a in answers if (a.ai_evaluation or {}).get("stage") != "retention"]
    retention_answers = [a for a in answers if (a.ai_evaluation or {}).get("stage") == "retention"]
    scored = [a.score for a in current_answers if a.score is not None]
    average_score = (sum(scored) / len(scored)) if scored else 0
    retention_scored = [a.score for a in retention_answers if a.score is not None]
    retention_score = (sum(retention_scored) / len(retention_scored)) if retention_scored else None
    dims = [a.ai_evaluation.get("dimensions", {}) for a in current_answers if isinstance(a.ai_evaluation, dict)]
    def avg_dim(name: str) -> float:
        vals = [float(d.get(name)) for d in dims if isinstance(d, dict) and isinstance(d.get(name), (int, float))]
        return sum(vals) / len(vals) if vals else average_score
    understanding_avg = avg_dim("understanding")
    application_avg = avg_dim("skill_application")
    accuracy_avg = avg_dim("accuracy")
    independence_avg = avg_dim("independence")
    consistency_avg = avg_dim("consistency")
    has_clear_weak_answer = any(
        (a.score is not None and a.score < 50)
        or (a.ai_evaluation or {}).get("understanding") == "weak"
        for a in current_answers
    )
    mastery_confirmed = (
        len(answers) >= 4
        and average_score >= 80
        and understanding_avg >= 75
        and application_avg >= 75
        and accuracy_avg >= 80
        and independence_avg >= 75
        and consistency_avg >= 70
        and not has_clear_weak_answer
    )
    needs_reteach = not mastery_confirmed

    # Recover the task from the persisted evaluation metadata. This works even
    # when the quiz was started directly without the optional study timer.
    task_indexes = [
        int((a.ai_evaluation or {}).get("taskIndex"))
        for a in answers
        if isinstance((a.ai_evaluation or {}).get("taskIndex"), int)
    ]
    if not task_indexes:
        task_index = _current_task_index_from_messages(session.messages)
    else:
        task_index = task_indexes[-1]

    _set_status(session, "teaching")

    # Read the persisted learning plan from the teaching snapshot.
    plan: list[dict] = []
    for teaching in session.teaching:
        raw = teaching.raw_content or ""
        try:
            candidate = parse_json(raw).get("learning_tasks")
            if isinstance(candidate, list) and candidate:
                plan = candidate
                break
        except Exception:
            continue

    current_task = plan[task_index] if 0 <= task_index < len(plan) else {}
    current_title = _safe_str(current_task.get("title"), f"Learning task {task_index + 1}")
    next_task_index = task_index + 1
    has_next = next_task_index < len(plan)
    next_title = _safe_str(
        plan[next_task_index].get("title") if has_next else "",
        f"Learning task {next_task_index + 1}" if has_next else "",
    )

    if needs_reteach:
        content = (
            "Your practice is complete, and I’ve restored our conversation. "
            "Most of your work was on track, but the check exposed a distinction we should make clearer. "
            "We’ll stay on this Learning Plan task, clarify that distinction, and then try the check again."
        )
        extra = {
            "practiceComplete": True,
            "taskCompleted": False,
            "taskIndex": task_index,
            "currentTaskIndex": task_index,
            "questionIds": sorted(ids),
            "needsReteach": True,
            "masteryConfirmed": False,
            "masteryMetrics": {"averageScore": round(average_score), "understanding": round(understanding_avg), "application": round(application_avg), "accuracy": round(accuracy_avg), "independence": round(independence_avg), "consistency": round(consistency_avg), "retentionScore": round(retention_score) if retention_score is not None else None},
        }
    elif has_next:
        content = (
            f"Nice work — you’ve completed **{current_title}**. "
            "Your practice is finished and our learning conversation is restored. "
            f"Does the explanation make sense, and are you ready to move to **{next_title}**?"
        )
        extra = {
            "practiceComplete": True,
            # Passing the compulsory quiz is not itself task completion. The
            # learner must explicitly confirm readiness for the next task.
            "taskCompleted": False,
            "taskIndex": task_index,
            "currentTaskIndex": task_index,
            "nextTaskIndex": next_task_index,
            "taskTransition": True,
            "questionIds": sorted(ids),
            "needsReteach": False,
            "masteryConfirmed": True,
            "masteryMetrics": {"averageScore": round(average_score), "understanding": round(understanding_avg), "application": round(application_avg), "accuracy": round(accuracy_avg), "independence": round(independence_avg), "consistency": round(consistency_avg), "retentionScore": round(retention_score) if retention_score is not None else None},
        }
    else:
        content = (
            f"Nice work — you’ve completed **{current_title}**. "
            "That was the final Learning Plan task for this session. "
            "Your practice is complete and your learning conversation is restored."
        )
        extra = {
            "practiceComplete": True,
            "taskCompleted": True,
            "taskIndex": task_index,
            "currentTaskIndex": task_index,
            "finalTask": True,
            "questionIds": sorted(ids),
            "needsReteach": False,
            "masteryConfirmed": True,
            "masteryMetrics": {"averageScore": round(average_score), "understanding": round(understanding_avg), "application": round(application_avg), "accuracy": round(accuracy_avg), "independence": round(independence_avg), "consistency": round(consistency_avg), "retentionScore": round(retention_score) if retention_score is not None else None},
        }

    # This is a tutor message, not a student/system message. It therefore
    # survives refresh with the correct avatar and speaker identity.
    await _add_message(
        session_id, "ai", "practice", content, db, extra=extra
    )
    await db.commit()
    await db.refresh(session)
    return {
        **session.serialize(),
        "needsReteach": needs_reteach,
        "questionIds": sorted(ids),
        "taskIndex": task_index,
        "taskCompleted": bool(extra.get("taskCompleted")),
        "masteryConfirmed": bool(extra.get("masteryConfirmed")),
        "masteryMetrics": extra.get("masteryMetrics") or {},
        "nextTaskIndex": next_task_index if has_next else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ADAPTIVE RETEACHING
# ─────────────────────────────────────────────────────────────────────────────

async def generate_adaptive_reteach(
    session_id: int, user_id: int, reason: Optional[str], db: AsyncSession
) -> dict:
    session = await _get_session_owned(
        session_id, user_id, db, load_teaching=True, load_attempts=True, load_messages=True
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

    # Reteaching is scoped to the same Learning Plan item that just failed.
    # It must not broaden back out to the whole concept or future tasks.
    current_task_index = _current_task_index_from_messages(session.messages)
    learning_plan: list[dict] = []
    for teaching in session.teaching:
        try:
            candidate = parse_json(teaching.raw_content or "{}").get("learning_tasks")
            if isinstance(candidate, list) and candidate:
                learning_plan = candidate
                break
        except Exception:
            continue
    current_task = (
        learning_plan[current_task_index]
        if 0 <= current_task_index < len(learning_plan)
        else {}
    )
    current_task_title = _safe_str(current_task.get("title"), f"Learning task {current_task_index + 1}")
    current_task_objectives = current_task.get("objectiveIds") or current_task.get("objective_ids") or []

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

    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
        "You are an adaptive AI tutor. The student struggled with this concept. "
        "Use a completely different teaching approach — do NOT repeat previous explanations. "
        "Return JSON only."
    )
    prompt = f"""{curriculum_ctx}

CURRENT LEARNING PLAN TASK — RETEACH ONLY THIS TASK
Task number: {current_task_index + 1}
Task title: {current_task_title}
Task objectives: {current_task_objectives}
Task description: {current_task.get("description", "")}
Task focus: {current_task.get("focus", "")}

Do NOT reteach future Learning Plan tasks or unrelated parts of the concept.
Use only the current task's material/objectives and the student's demonstrated gaps.

PREVIOUS STRATEGIES USED: {', '.join(used_strategies)}
NEW STRATEGY: {new_strategy}
STUDENT STRUGGLES (recent answers):
{struggle_context}
{misconception_note}
STUDENT REASON: {reason or '(none given)'}

Reteach ONLY "{current_task_title}" using the '{new_strategy}' strategy.
Make it genuinely different — a fresh angle addressing the student's actual struggles.
{f"Specifically address: {identified_misconceptions[0]}" if identified_misconceptions else ""}

IMPORTANT-POINT FORMATTING:
- Use `==...==` around the most important terms, definitions, rules, formulas, or conclusions so the Learning Room renders a coloured background highlight.
- Use `**...**` only for ordinary emphasis. Keep highlights short and selective; do not highlight entire paragraphs.
- Highlighted text must remain fully visible and readable.

READABLE RESPONSE LAYOUT (MANDATORY):
- Format the reteaching for a student reading on a phone; never produce one giant wall of text.
- Use short paragraphs separated by blank lines (`\n\n`).
- Use Markdown headings for distinct sections and bullets or numbered lists for multiple points.
- For worked examples, put each calculation step on its own line and separate the final answer clearly.
- Keep related ideas together in small paragraphs of about 2–4 sentences.

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

    valid_objective_ids = {int(x) for x in current_task_objectives if str(x).isdigit()}
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
    await _add_ai_response(
        session_id, "reteach", message_content, db,
        extra={
            "strategy": new_strategy,
            "teachingId": teaching.id,
            "provider": provider,
            "taskIndex": _current_task_index_from_messages(session.messages),
            "currentTaskIndex": _current_task_index_from_messages(session.messages),
        },
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

    # Build rich per-question detail (question text + student answer + feedback)
    q_by_id = {q.id: q for q in (session.questions or [])}
    detail_lines = []
    for i, a in enumerate(all_answers[:12]):
        q = q_by_id.get(a.question_id)
        qtext = (q.question if q else "Question")[:240]
        feedback = (a.feedback or "")[:220]
        detail_lines.append(
            f"  Q{i+1}: {qtext}\n"
            f"    Student answer: {(a.student_answer or '')[:180]}\n"
            f"    Score: {a.score}/100 | Correct: {a.is_correct}\n"
            f"    Feedback: {feedback}"
        )
    answer_details = "\n".join(detail_lines) or "  No answers submitted."

    score_display = f"{overall_score}/100" if overall_score is not None else "N/A"
    if overall_score is None:
        review_days, mastery_level = 1, "unknown"
    elif overall_score >= 80:
        review_days, mastery_level = 3, "strong"
    elif overall_score >= 60:
        review_days, mastery_level = 1, "partial"
    else:
        review_days, mastery_level = 0, "weak"

    system_prompt = _MATH_FORMATTING_SYSTEM + "\n" + (
        "You are an AI tutor generating a learning session summary. "
        "Be specific about the actual questions and answers. Return JSON only."
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

Answer breakdown (use this content — do not invent questions):
{answer_details}

Generate a comprehensive session summary grounded in the actual answers above.

Return JSON:
{{
  "summary_text": "2–3 paragraph narrative of what the student learned and where they struggled, referencing real question ideas.",
  "key_ideas": ["Key idea 1", "Key idea 2"],
  "strengths": ["What they understood well"],
  "areas_for_practice": ["What needs more work"],
  "recommended_next": "Brief next study step",
  "teaching_methods_used": {strategies_used},
  "review_after_days": {review_days},
  "mastery_level": "{mastery_level}"
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

    review_days = int(parsed.get("review_after_days") or review_days)
    mastery_level = _safe_str(parsed.get("mastery_level"), mastery_level) or mastery_level
    from datetime import timedelta
    review_date = (_now() + timedelta(days=max(0, review_days))).date().isoformat()

    summary_body = summary.summary_text or "Session complete."
    summary_body += (
        f"\n\n**Review plan:** come back on **{review_date}** "
        f"(mastery: {mastery_level}). Spaced review beats one long session."
    )
    await _add_message(
        session_id, "ai", "summary",
        summary_body,
        db,
        extra={
            "reviewDate": review_date,
            "reviewAfterDays": review_days,
            "masteryLevel": mastery_level,
            "finalTask": True,
            "taskCompleted": True,
        },
    )

    if session.status not in ("completed", "abandoned"):
        session.status       = "completed"
        session.completed_at = _now()

    await db.commit()
    await db.refresh(summary)

    # Persist concept mastery map so the next session opens like a real teacher.
    try:
        await lp_svc.upsert_concept_mastery(
            user_id,
            concept_id=session.concept_id,
            concept_name=concept.name,
            mastery_level=mastery_level,
            known_misconceptions=_safe_list(parsed.get("areas_for_practice"))[:6],
            strong_on=_safe_list(parsed.get("strengths"))[:6],
            weak_on=_safe_list(parsed.get("areas_for_practice"))[:6],
            review_after_days=review_days,
            db=db,
        )
    except Exception as mastery_exc:
        logger.warning("Concept mastery update failed (non-fatal): %s", mastery_exc)

    # Persist this completed AI-learning evidence into the existing progress
    # architecture. The operation is idempotent and never touches challenge
    # practice_score. Streak/activity is recorded through the same service used
    # by the rest of Knovi.
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

    out = summary.serialize()
    out["reviewDate"] = review_date
    out["reviewAfterDays"] = review_days
    out["masteryLevel"] = mastery_level
    return out


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
