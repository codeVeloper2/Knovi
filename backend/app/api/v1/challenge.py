"""
Challenge API — peer-to-peer concept verification

Flow:
  1. POST /challenge/find          → find or create a waiting session
  2. GET  /challenge/{id}          → poll session state
  3. POST /challenge/{id}/ready    → mark self as ready (both ready → start)
  4. POST /challenge/{id}/generate-questions → AI generates 5 questions
  5. POST /challenge/{id}/submit-answers     → submit independent answers
  6. POST /challenge/{id}/ask-peer           → ask partner a question
  7. POST /challenge/{id}/answer-peer        → answer partner's question
  8. POST /challenge/{id}/evaluate           → AI evaluates entire session
  9. POST /challenge/{id}/cancel             → cancel / leave gracefully
  10. POST /challenge/{id}/heartbeat         → keep alive

All endpoints enforce:
  - challenge_eligible = True in ConceptProgress
  - Not already in an active challenge for this concept
  - Correct session status for the requested action
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.dependencies import current_user as get_current_user
from app.models.challenge_session import ChallengeSession
from app.models.concept_progress import ConceptProgress
from app.models.curriculum import Concept, Subject, Topic
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/challenge", tags=["challenge"])

WAITING_SESSION_TTL_MINUTES = 30
ACTIVE_SESSION_TTL_MINUTES  = 60
DISCONNECT_GRACE_SECONDS    = 90   # partner considered gone after this


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Pydantic bodies ──────────────────────────────────────────────────────────

class FindChallengeRequest(BaseModel):
    conceptId: int

class SubmitAnswersRequest(BaseModel):
    answers: dict[str, str]   # {"0": "A", "1": "B", ...}

class AskPeerRequest(BaseModel):
    question: str

class AnswerPeerRequest(BaseModel):
    exchangeIndex: int
    answer: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _require_challenge_eligible(db: AsyncSession, user_id: int, concept_id: int) -> ConceptProgress:
    result = await db.execute(
        select(ConceptProgress)
        .where(ConceptProgress.user_id == user_id)
        .where(ConceptProgress.concept_id == concept_id)
    )
    prog = result.scalar_one_or_none()
    if not prog or not prog.challenge_eligible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete all solo learning stages before joining a Challenge.",
        )
    if prog.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This concept is already verified.",
        )
    return prog


async def _get_session_or_404(db: AsyncSession, session_id: int) -> ChallengeSession:
    result = await db.execute(
        select(ChallengeSession).where(ChallengeSession.id == session_id)
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Challenge session not found.")
    return sess


async def _require_participant(sess: ChallengeSession, user_id: int) -> str:
    """Return 'initiator' or 'partner'. Raise 403 if not a participant."""
    if sess.initiator_id == user_id:
        return "initiator"
    if sess.partner_id == user_id:
        return "partner"
    raise HTTPException(status_code=403, detail="You are not a participant in this challenge.")


def _call_gemini_sync(prompt: str, temperature: float = 0.4, json_mode: bool = True) -> Any:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    cfg: dict[str, Any] = {"temperature": temperature}
    if json_mode:
        cfg["response_mime_type"] = "application/json"
    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        generation_config=genai.GenerationConfig(**cfg),
    )
    response = model.generate_content(prompt)
    text = response.text.strip()
    if json_mode:
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    return text


async def _gemini(prompt: str, temperature: float = 0.4, json_mode: bool = True) -> Any:
    timeout = float(getattr(settings, "AI_REQUEST_TIMEOUT", 60))
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_call_gemini_sync, prompt, temperature, json_mode),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise HTTPException(503, detail="AI request timed out. Please try again.")
    except Exception as exc:
        logger.exception("Gemini error: %s", exc)
        raise HTTPException(503, detail="AI is temporarily unavailable. Please try again.")


# ─── 1. POST /challenge/find ─────────────────────────────────────────────────

@router.post("/find")
async def find_challenge(
    body: FindChallengeRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Find an existing waiting session for this concept, or create one.

    Matching criteria:
      - same concept
      - status = 'waiting'
      - initiator is NOT the current user
      - initiator is challenge_eligible
      - not expired

    If no partner available: returns a new 'waiting' session for the user.
    """
    concept_id = body.conceptId
    await _require_challenge_eligible(db, current_user.id, concept_id)

    # Load concept for topic/subject
    concept_result = await db.execute(
        select(Concept, Topic, Subject)
        .join(Topic, Concept.topic_id == Topic.id)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Concept.id == concept_id)
    )
    row = concept_result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Concept not found.")
    concept, topic, subject = row

    # Check user doesn't already have an active session for this concept
    existing_result = await db.execute(
        select(ChallengeSession).where(
            and_(
                ChallengeSession.concept_id == concept_id,
                ChallengeSession.status.in_(["waiting", "lobby", "questions", "peer_exchange"]),
                or_(
                    ChallengeSession.initiator_id == current_user.id,
                    ChallengeSession.partner_id   == current_user.id,
                ),
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return {
            "ok": True,
            "session": existing.serialize(current_user.id),
            "joined": False,
            "message": "Resuming existing challenge session.",
        }

    # Find a waiting session to join (not our own, not expired)
    cutoff = _now() - timedelta(minutes=WAITING_SESSION_TTL_MINUTES)
    waiting_result = await db.execute(
        select(ChallengeSession).where(
            and_(
                ChallengeSession.concept_id  == concept_id,
                ChallengeSession.status      == "waiting",
                ChallengeSession.initiator_id != current_user.id,
                ChallengeSession.partner_id   == None,  # noqa: E711
                ChallengeSession.created_at   >= cutoff,
            )
        ).order_by(ChallengeSession.created_at)
    )
    waiting = waiting_result.scalars().first()

    if waiting:
        # Join this session as partner
        waiting.partner_id = current_user.id
        waiting.status = "lobby"
        waiting.partner_last_seen = _now()
        waiting.expires_at = _now() + timedelta(minutes=ACTIVE_SESSION_TTL_MINUTES)
        waiting.updated_at = _now()
        await db.commit()
        await db.refresh(waiting)
        logger.info("Challenge joined: session=%d user=%d", waiting.id, current_user.id)
        return {
            "ok": True,
            "session": waiting.serialize(current_user.id),
            "joined": True,
            "message": "Partner found! Entering lobby.",
        }

    # No partner — create a new waiting session
    new_sess = ChallengeSession(
        concept_id   = concept_id,
        topic_id     = topic.id,
        subject_id   = subject.id,
        initiator_id = current_user.id,
        status       = "waiting",
        initiator_last_seen = _now(),
        expires_at   = _now() + timedelta(minutes=WAITING_SESSION_TTL_MINUTES),
    )
    db.add(new_sess)
    await db.commit()
    await db.refresh(new_sess)
    logger.info("Challenge created: session=%d user=%d", new_sess.id, current_user.id)
    return {
        "ok": True,
        "session": new_sess.serialize(current_user.id),
        "joined": False,
        "message": "No partner available right now. Waiting for someone to join.",
    }


# ─── 2. GET /challenge/{id} ──────────────────────────────────────────────────

@router.get("/{session_id}")
async def get_challenge_session(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Poll session state."""
    sess = await _get_session_or_404(db, session_id)
    await _require_participant(sess, current_user.id)

    # Update heartbeat
    role = "initiator" if sess.initiator_id == current_user.id else "partner"
    if role == "initiator":
        sess.initiator_last_seen = _now()
    else:
        sess.partner_last_seen = _now()
    sess.updated_at = _now()
    await db.commit()
    await db.refresh(sess)

    return {"ok": True, "session": sess.serialize(current_user.id)}


# ─── 3. POST /challenge/{id}/ready ───────────────────────────────────────────

@router.post("/{session_id}/ready")
async def mark_ready(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark self as ready in lobby. Both ready → advance to 'questions'."""
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    if sess.status != "lobby":
        raise HTTPException(400, detail=f"Cannot mark ready in status '{sess.status}'.")
    if not sess.partner_id:
        raise HTTPException(400, detail="Waiting for a partner to join first.")

    if role == "initiator":
        sess.initiator_ready = True
        sess.initiator_last_seen = _now()
    else:
        sess.partner_ready = True
        sess.partner_last_seen = _now()

    # Both ready → advance
    if sess.initiator_ready and sess.partner_ready:
        sess.status     = "questions"
        sess.started_at = _now()
        sess.expires_at = _now() + timedelta(minutes=ACTIVE_SESSION_TTL_MINUTES)
        logger.info("Challenge both ready, advancing to questions: session=%d", session_id)

    sess.updated_at = _now()
    await db.commit()
    await db.refresh(sess)
    return {"ok": True, "session": sess.serialize(current_user.id)}


# ─── 4. POST /challenge/{id}/generate-questions ──────────────────────────────

@router.post("/{session_id}/generate-questions")
async def generate_challenge_questions(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    AI generates 5 questions for this challenge.
    Only the initiator triggers generation; both players receive the same set.
    Questions are based on the concept, topic, subject, and key points.
    """
    sess = await _get_session_or_404(db, session_id)
    await _require_participant(sess, current_user.id)

    if sess.status != "questions":
        raise HTTPException(400, detail="Challenge is not in the questions phase.")

    # Already generated — return cached
    if sess.questions:
        return {"ok": True, "questions": sess.questions, "cached": True}

    # Only initiator generates (race protection)
    if sess.initiator_id != current_user.id:
        # Partner polls until questions appear
        return {"ok": True, "questions": None, "waiting": True}

    # Load concept context
    concept_result = await db.execute(
        select(Concept, Topic, Subject)
        .join(Topic, Concept.topic_id == Topic.id)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Concept.id == sess.concept_id)
    )
    row = concept_result.one_or_none()
    if not row:
        raise HTTPException(404, detail="Concept not found.")
    concept, topic, subject = row

    # Load the initiator's lesson content for curriculum-bound questions
    prog_result = await db.execute(
        select(ConceptProgress)
        .where(ConceptProgress.user_id   == sess.initiator_id)
        .where(ConceptProgress.concept_id == sess.concept_id)
    )
    prog = prog_result.scalar_one_or_none()
    lesson_context = json.dumps(prog.lesson_content, indent=2) if prog and prog.lesson_content else "(lesson not available)"

    key_points_text = "\n".join(f"- {kp}" for kp in (concept.key_points or []))

    prompt = f"""You are creating a peer Challenge assessment for two students who have both completed the solo learning pipeline for this concept.

Subject: {subject.name}
Topic: {topic.name}
Concept: {concept.name}

Concept explanation: {concept.explanation}

Key learning points:
{key_points_text}

What was taught in the lesson:
{lesson_context}

TASK: Create exactly 5 multiple-choice questions to assess mastery of this concept.

Requirements:
- Questions MUST be based on the concept above (curriculum-bound)
- Mix of recall, understanding, and application (not just memorization)
- Each question has exactly 4 options: A, B, C, D
- correctAnswer is exactly "A", "B", "C", or "D"
- Difficulty progression: Q1 easy → Q5 harder
- Questions should collectively cover different aspects of the concept

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "options": {{"A": "option", "B": "option", "C": "option", "D": "option"}},
      "correctAnswer": "A",
      "explanation": "Why this answer is correct",
      "difficulty": "easy"|"medium"|"hard",
      "keyAspect": "which aspect of the concept this tests"
    }}
  ],
  "passingScore": 60
}}"""

    questions_data = await _gemini(prompt, temperature=0.3)
    questions_data["generatedAt"] = _now().isoformat()
    questions_data["sessionId"]   = session_id

    sess.questions              = questions_data
    sess.questions_generated_at = _now()
    sess.updated_at             = _now()
    await db.commit()
    await db.refresh(sess)

    logger.info("Challenge questions generated: session=%d", session_id)
    return {"ok": True, "questions": sess.questions}


# ─── 5. POST /challenge/{id}/submit-answers ──────────────────────────────────

@router.post("/{session_id}/submit-answers")
async def submit_challenge_answers(
    session_id: int,
    body: SubmitAnswersRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Submit independent answers to the 5 questions.
    Backend evaluates immediately but does NOT reveal the other player's answers
    until both have submitted (preventing copying).
    When both have submitted, advance to peer_exchange.
    """
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    if sess.status != "questions":
        raise HTTPException(400, detail="Not in the questions phase.")
    if not sess.questions:
        raise HTTPException(400, detail="Questions not yet generated.")

    questions = sess.questions.get("questions", [])
    passing_score = sess.questions.get("passingScore", 60)

    # Evaluate answers
    results = []
    correct_count = 0
    for idx, q in enumerate(questions):
        user_ans    = body.answers.get(str(idx), "").strip().upper()
        correct_ans = q.get("correctAnswer", "").strip().upper()
        is_correct  = user_ans == correct_ans
        if is_correct:
            correct_count += 1
        results.append({
            "questionIndex": idx,
            "userAnswer":    user_ans,
            "correctAnswer": correct_ans,
            "isCorrect":     is_correct,
            "explanation":   q.get("explanation"),
        })

    score  = int((correct_count / len(questions)) * 100) if questions else 0
    passed = score >= passing_score

    answer_record = {
        "answers": body.answers,
        "results": results,
        "score":   score,
        "passed":  passed,
        "submittedAt": _now().isoformat(),
    }

    if role == "initiator":
        if sess.initiator_answers:  # already submitted
            raise HTTPException(400, detail="You have already submitted answers.")
        sess.initiator_answers = answer_record
        sess.initiator_score   = score
    else:
        if sess.partner_answers:
            raise HTTPException(400, detail="You have already submitted answers.")
        sess.partner_answers = answer_record
        sess.partner_score   = score

    # Both submitted → advance to peer_exchange
    both_submitted = bool(sess.initiator_answers) and bool(sess.partner_answers)
    if both_submitted:
        sess.status = "peer_exchange"
        logger.info("Both answered, advancing to peer_exchange: session=%d", session_id)

    sess.updated_at = _now()
    await db.commit()
    await db.refresh(sess)

    return {
        "ok": True,
        "score": score,
        "passed": passed,
        "results": results,
        "bothSubmitted": both_submitted,
        "session": sess.serialize(current_user.id),
    }


# ─── 6. POST /challenge/{id}/ask-peer ────────────────────────────────────────

@router.post("/{session_id}/ask-peer")
async def ask_peer_question(
    session_id: int,
    body: AskPeerRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    In the peer_exchange phase, each student asks the other a question.
    Each player gets one turn asking. AI can provide a hint if the answerer is stuck.
    """
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    if sess.status != "peer_exchange":
        raise HTTPException(400, detail="Not in the peer exchange phase.")

    if not body.question or len(body.question.strip()) < 5:
        raise HTTPException(400, detail="Question is too short.")

    exchanges = list(sess.peer_exchanges or [])

    # Check this user hasn't asked already
    already_asked = any(
        e.get("askerRole") == role for e in exchanges
    )
    if already_asked:
        raise HTTPException(400, detail="You have already asked your question.")

    exchange = {
        "index":     len(exchanges),
        "askerRole": role,
        "askerId":   current_user.id,
        "question":  body.question.strip(),
        "answer":    None,
        "isCorrect": None,
        "hintUsed":  False,
        "hint":      None,
        "aiEval":    None,
        "askedAt":   _now().isoformat(),
    }
    exchanges.append(exchange)
    sess.peer_exchanges = exchanges
    sess.updated_at = _now()
    await db.commit()

    return {"ok": True, "exchangeIndex": exchange["index"], "session": sess.serialize(current_user.id)}


# ─── 7. POST /challenge/{id}/answer-peer ─────────────────────────────────────

@router.post("/{session_id}/answer-peer")
async def answer_peer_question(
    session_id: int,
    body: AnswerPeerRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Answer the peer's question. AI evaluates the answer for conceptual understanding.
    If the answer is wrong, AI provides a hint (not the full answer).
    """
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    if sess.status != "peer_exchange":
        raise HTTPException(400, detail="Not in the peer exchange phase.")

    exchanges = list(sess.peer_exchanges or [])
    if body.exchangeIndex >= len(exchanges):
        raise HTTPException(404, detail="Exchange not found.")

    exchange = dict(exchanges[body.exchangeIndex])

    # This player should be the answerer (not the asker)
    if exchange.get("askerRole") == role:
        raise HTTPException(400, detail="You cannot answer your own question.")
    if exchange.get("answer") is not None:
        raise HTTPException(400, detail="This question has already been answered.")

    # Load concept for AI evaluation context
    concept_result = await db.execute(
        select(Concept, Topic, Subject)
        .join(Topic, Concept.topic_id == Topic.id)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Concept.id == sess.concept_id)
    )
    crow = concept_result.one_or_none()
    concept_name = crow[0].name if crow else "this concept"
    key_points = crow[0].key_points or [] if crow else []
    key_points_text = "\n".join(f"- {kp}" for kp in key_points)

    # AI evaluates the answer
    eval_prompt = f"""A student is answering a peer's question during a concept challenge.

Concept: {concept_name}
Key learning points:
{key_points_text}

Peer's question: "{exchange['question']}"
Student's answer: "{body.answer.strip()}"

Evaluate whether the answer demonstrates understanding of the concept.
Be lenient on exact wording — focus on whether the core idea is correct.

Return JSON:
{{
  "isCorrect": true|false,
  "feedbackForAnswerer": "Brief feedback (1-2 sentences, not the full answer if wrong)",
  "hint": "A helpful hint that guides without revealing the answer (only include if isCorrect=false)",
  "explanation": "The correct explanation (for records)"
}}"""

    try:
        ai_eval = await _gemini(eval_prompt, temperature=0.3)
    except HTTPException:
        # AI unavailable — mark as needs manual review
        ai_eval = {
            "isCorrect": None,
            "feedbackForAnswerer": "AI evaluation unavailable — your answer has been saved.",
            "hint": None,
            "explanation": None,
        }

    exchange["answer"]    = body.answer.strip()
    exchange["isCorrect"] = ai_eval.get("isCorrect")
    exchange["aiEval"]    = ai_eval
    exchange["hint"]      = ai_eval.get("hint") if not ai_eval.get("isCorrect") else None
    exchange["answeredAt"]= _now().isoformat()

    exchanges[body.exchangeIndex] = exchange
    sess.peer_exchanges = exchanges

    # Check if all exchanges are complete (both players answered)
    # Pattern: each player asks once → 2 exchanges total, both answered
    all_answered = all(e.get("answer") is not None for e in exchanges)
    askers = {e.get("askerRole") for e in exchanges}
    both_asked = "initiator" in askers and "partner" in askers

    if all_answered and both_asked:
        sess.status = "evaluating"
        logger.info("Peer exchange complete, advancing to evaluating: session=%d", session_id)

    sess.updated_at = _now()
    await db.commit()
    await db.refresh(sess)

    return {
        "ok": True,
        "isCorrect": ai_eval.get("isCorrect"),
        "feedback":  ai_eval.get("feedbackForAnswerer"),
        "hint":      exchange.get("hint"),
        "session":   sess.serialize(current_user.id),
    }


# ─── 8. POST /challenge/{id}/request-hint ────────────────────────────────────

@router.post("/{session_id}/request-hint")
async def request_hint(
    session_id: int,
    body: dict,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Request an AI hint for a peer exchange question without revealing the answer."""
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    exchange_index = body.get("exchangeIndex")
    if exchange_index is None:
        raise HTTPException(400, detail="exchangeIndex required.")

    exchanges = list(sess.peer_exchanges or [])
    if exchange_index >= len(exchanges):
        raise HTTPException(404, detail="Exchange not found.")

    exchange = dict(exchanges[exchange_index])
    if exchange.get("hintUsed"):
        return {"ok": True, "hint": exchange.get("hint", "No additional hint available.")}

    concept_result = await db.execute(
        select(Concept).where(Concept.id == sess.concept_id)
    )
    concept = concept_result.scalar_one_or_none()
    key_points_text = "\n".join(f"- {kp}" for kp in (concept.key_points or [])) if concept else ""

    hint_prompt = f"""A student is stuck on a question during a peer challenge.

Concept: {concept.name if concept else 'unknown'}
Key points: {key_points_text}
Question: "{exchange['question']}"

Give a helpful hint that guides the student toward the answer WITHOUT revealing it.
The hint should point to the relevant concept or principle.
Keep it to 1-2 sentences.

Return JSON: {{"hint": "hint text"}}"""

    try:
        result = await _gemini(hint_prompt, temperature=0.5)
        hint = result.get("hint", "Think about the key principles you learned in the lesson.")
    except HTTPException:
        hint = "Review the key points from your lesson."

    exchange["hintUsed"] = True
    exchange["hint"]     = hint
    exchanges[exchange_index] = exchange
    sess.peer_exchanges = exchanges
    sess.updated_at = _now()
    await db.commit()

    return {"ok": True, "hint": hint}


# ─── 9. POST /challenge/{id}/evaluate ────────────────────────────────────────

@router.post("/{session_id}/evaluate")
async def evaluate_challenge(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    AI evaluates the complete challenge session and determines pass/fail for each student.

    Evidence used:
    - 5-question performance (score)
    - peer exchange questions asked and answered
    - detected knowledge gaps
    - overall curriculum coverage

    Backend decides result — frontend cannot override it.
    """
    sess = await _get_session_or_404(db, session_id)
    await _require_participant(sess, current_user.id)

    if sess.status not in ("evaluating", "peer_exchange"):
        raise HTTPException(400, detail=f"Cannot evaluate in status '{sess.status}'.")

    # Idempotent — return cached result
    if sess.evaluation_result and sess.status in ("completed", "failed"):
        return {"ok": True, "session": sess.serialize(current_user.id)}

    concept_result = await db.execute(
        select(Concept, Topic, Subject)
        .join(Topic, Concept.topic_id == Topic.id)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Concept.id == sess.concept_id)
    )
    row = concept_result.one_or_none()
    if not row:
        raise HTTPException(404, detail="Concept not found.")
    concept, topic, subject = row

    # Summarize evidence
    initiator_answers_data = sess.initiator_answers or {}
    partner_answers_data   = sess.partner_answers   or {}

    initiator_score = sess.initiator_score or 0
    partner_score   = sess.partner_score   or 0

    peer_exchange_summary = []
    for ex in (sess.peer_exchanges or []):
        peer_exchange_summary.append({
            "askerRole":    ex.get("askerRole"),
            "question":     ex.get("question"),
            "answer":       ex.get("answer"),
            "isCorrect":    ex.get("isCorrect"),
            "hintUsed":     ex.get("hintUsed", False),
        })

    eval_prompt = f"""You are evaluating a peer challenge session for concept mastery.

Concept: {concept.name}
Subject: {subject.name} / Topic: {topic.name}
Key points: {json.dumps(concept.key_points or [], indent=2)}

EVIDENCE:

Initiator (student A):
- 5-question score: {initiator_score}%
- Answers: {json.dumps(initiator_answers_data.get('results', []))}

Partner (student B):
- 5-question score: {partner_score}%
- Answers: {json.dumps(partner_answers_data.get('results', []))}

Peer exchange (each asked the other a question):
{json.dumps(peer_exchange_summary, indent=2)}

TASK: Evaluate each student's mastery of the concept based on ALL evidence.

Passing criteria:
- Overall evidence shows genuine understanding (not just lucky guesses)
- Peer exchange demonstrates ability to discuss the concept
- Score >= 60% is a baseline, but qualitative evidence matters too

Return JSON:
{{
  "initiatorPassed": true|false,
  "partnerPassed":   true|false,
  "initiatorFeedback": "1-2 sentence personalised feedback for initiator",
  "partnerFeedback":   "1-2 sentence personalised feedback for partner",
  "initiatorGaps":     ["any gaps detected for initiator"],
  "partnerGaps":       ["any gaps detected for partner"],
  "overallSummary":    "Brief summary of how the challenge went",
  "passingScore": {{"initiator": {initiator_score}, "partner": {partner_score}}}
}}"""

    try:
        eval_result = await _gemini(eval_prompt, temperature=0.2)
    except HTTPException as exc:
        # AI unavailable — fall back to score-based pass/fail
        passing = 60
        eval_result = {
            "initiatorPassed":    initiator_score >= passing,
            "partnerPassed":      partner_score   >= passing,
            "initiatorFeedback":  f"Score: {initiator_score}%.",
            "partnerFeedback":    f"Score: {partner_score}%.",
            "initiatorGaps":      [],
            "partnerGaps":        [],
            "overallSummary":     "AI evaluation unavailable. Results based on question scores.",
            "passingScore":       {"initiator": initiator_score, "partner": partner_score},
        }

    initiator_passed = eval_result.get("initiatorPassed", False)
    partner_passed   = eval_result.get("partnerPassed",   False)

    sess.initiator_passed  = initiator_passed
    sess.partner_passed    = partner_passed
    sess.evaluation_result = eval_result
    sess.evaluated_at      = _now()
    sess.completed_at      = _now()

    # Both pass → completed; otherwise → failed
    sess.status = "completed" if (initiator_passed and partner_passed) else "failed"

    sess.updated_at = _now()
    await db.commit()
    await db.refresh(sess)

    # Update ConceptProgress for passing students
    passer_ids = []
    if initiator_passed:
        passer_ids.append(sess.initiator_id)
    if partner_passed and sess.partner_id:
        passer_ids.append(sess.partner_id)

    for uid in passer_ids:
        prog_result = await db.execute(
            select(ConceptProgress)
            .where(ConceptProgress.user_id    == uid)
            .where(ConceptProgress.concept_id == sess.concept_id)
        )
        prog = prog_result.scalar_one_or_none()
        if prog:
            prog.challenge_session_id = sess.id
            prog.challenge_passed     = True
            prog.challenge_passed_at  = _now()
            prog.verified             = True
            prog.verified_at          = _now()
            prog.current_stage        = "verified"
            prog.updated_at           = _now()
    await db.commit()

    # Handle failing students — reset for reteaching
    if sess.status == "failed":
        failer_data = {}
        if not initiator_passed:
            failer_data[sess.initiator_id] = eval_result.get("initiatorGaps", [])
        if not partner_passed and sess.partner_id:
            failer_data[sess.partner_id] = eval_result.get("partnerGaps", [])

        for uid, gaps in failer_data.items():
            prog_result = await db.execute(
                select(ConceptProgress)
                .where(ConceptProgress.user_id    == uid)
                .where(ConceptProgress.concept_id == sess.concept_id)
            )
            prog = prog_result.scalar_one_or_none()
            if prog:
                # Reset to checkpoint for reteaching cycle
                prog.checkpoint_passed     = False
                prog.checkpoint_passed_at  = None
                prog.explanation_passed    = False
                prog.explanation_passed_at = None
                prog.ai_verification_passed = False
                prog.ai_verification_at    = None
                prog.ai_verification_result = None
                prog.challenge_eligible    = False
                prog.reteaching_count      = (prog.reteaching_count or 0) + 1
                prog.current_stage         = "checkpoint"
                prog.updated_at            = _now()
        await db.commit()

    logger.info(
        "Challenge evaluated: session=%d initiator_passed=%s partner_passed=%s",
        session_id, initiator_passed, partner_passed,
    )
    return {"ok": True, "session": sess.serialize(current_user.id)}


# ─── 10. POST /challenge/{id}/cancel ─────────────────────────────────────────

@router.post("/{session_id}/cancel")
async def cancel_challenge(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel / leave a challenge session.
    Partner is NOT penalised for initiator leaving.
    If partner leaves mid-session, session is cancelled but initiator keeps progress.
    """
    sess = await _get_session_or_404(db, session_id)
    await _require_participant(sess, current_user.id)

    if sess.status in ("completed", "failed", "cancelled"):
        return {"ok": True, "message": "Session already ended."}

    sess.status     = "cancelled"
    sess.updated_at = _now()
    await db.commit()

    logger.info("Challenge cancelled: session=%d by user=%d", session_id, current_user.id)
    return {"ok": True, "message": "Challenge session cancelled."}


# ─── 11. POST /challenge/{id}/heartbeat ──────────────────────────────────────

@router.post("/{session_id}/heartbeat")
async def heartbeat(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Keep-alive ping. Returns partner's online status."""
    sess = await _get_session_or_404(db, session_id)
    role = await _require_participant(sess, current_user.id)

    now = _now()
    if role == "initiator":
        sess.initiator_last_seen = now
    else:
        sess.partner_last_seen = now
    sess.updated_at = now
    await db.commit()

    # Check partner online status
    cutoff = now - timedelta(seconds=DISCONNECT_GRACE_SECONDS)
    if role == "initiator":
        partner_online = bool(sess.partner_last_seen and sess.partner_last_seen >= cutoff)
    else:
        partner_online = bool(sess.initiator_last_seen and sess.initiator_last_seen >= cutoff)

    return {"ok": True, "partnerOnline": partner_online, "status": sess.status}
