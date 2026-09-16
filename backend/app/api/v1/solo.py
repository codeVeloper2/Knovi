"""Solo Learning API — /api/solo/

Handles the complete solo learning workflow:
  GET  /api/solo/subjects                       → list subjects with user progress
  GET  /api/solo/subjects/{id}/topics           → topics for subject
  GET  /api/solo/topics/{id}/concepts           → concepts + progress for topic
  GET  /api/solo/concepts/{id}/lesson           → full lesson content for a concept
  POST /api/solo/concepts/{id}/lesson-viewed    → mark lesson as viewed
  GET  /api/solo/concepts/{id}/checkpoint       → checkpoint questions
  POST /api/solo/concepts/{id}/checkpoint/answer → submit checkpoint answer
  GET  /api/solo/concepts/{id}/progress         → current progress record
  POST /api/solo/concepts/{id}/explanation      → submit "explain in your own words"
  POST /api/solo/concepts/{id}/ask              → ask AI a question about this concept
  GET  /api/solo/dashboard                      → dashboard data (continue learning, sync-ready)
  GET  /api/solo/history                        → recent activity feed
"""
from __future__ import annotations

import random
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import current_user
from app.models.curriculum import (
    Concept, Misconception, LearningObjective, Question, Subject, Topic,
)
from app.models.solo_learning import (
    CheckpointAnswer, ConceptProgress, ExplanationAttempt,
)
from app.models.user import User
from app.services import ai_service, progress_service

router = APIRouter()

_XP_CHECKPOINT_PASS = 20
_XP_EXPLANATION_CORRECT = 15
_XP_EXPLANATION_PARTIAL = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_concept_or_404(db: AsyncSession, concept_id: int) -> Concept:
    c = (await db.execute(
        select(Concept)
        .where(Concept.id == concept_id)
        .options(selectinload(Concept.topic))
    )).scalar_one_or_none()
    if c is None:
        raise HTTPException(404, "Concept not found.")
    return c


async def _get_or_create_progress(
    db: AsyncSession, user_id: int, concept: Concept
) -> ConceptProgress:
    cp = (await db.execute(
        select(ConceptProgress).where(
            ConceptProgress.user_id == user_id,
            ConceptProgress.concept_id == concept.id,
        )
    )).scalar_one_or_none()
    if cp is None:
        cp = ConceptProgress(
            user_id=user_id,
            topic_id=concept.topic_id,
            concept_id=concept.id,
        )
        db.add(cp)
        await db.flush()
    return cp


async def _load_topic_full(db: AsyncSession, topic_id: int) -> Topic:
    t = (await db.execute(
        select(Topic)
        .where(Topic.id == topic_id)
        .options(
            selectinload(Topic.concepts),
            selectinload(Topic.misconceptions),
            selectinload(Topic.learning_objectives),
            selectinload(Topic.questions),
            selectinload(Topic.subject),
        )
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(404, "Topic not found.")
    return t


def _is_correct_answer(question: Question, response: str) -> bool:
    """Simple answer checking for MCQ and short answers."""
    correct = (question.answer or "").strip().lower()
    resp = response.strip().lower()
    if question.question_type == "multiple_choice" and question.options:
        # Find the correct option — question.answer may be a label (A/B/C)
        # or the full option text. Resolve to both.
        correct_label = None
        correct_text = None
        for opt in question.options:
            lbl = opt.get("label", "").lower()
            txt = opt.get("text", "").lower()
            if lbl == correct or txt == correct:
                correct_label = lbl
                correct_text = txt
                break
        if correct_label is None:
            # Fallback: straight comparison
            return resp == correct
        # Student may submit a label (B) or the full text (Newton)
        return resp in (correct_label, correct_text)
    # short_answer / numeric: exact or close match
    if question.question_type == "numeric":
        try:
            return abs(float(resp) - float(correct)) < 1e-6
        except ValueError:
            return False
    return resp == correct


# ─────────────────────────────────────────────────────────────────────────────
# 1. Subjects list with progress
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/subjects")
async def list_subjects_with_progress(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    subjects = (await db.execute(
        select(Subject).where(Subject.is_active == True).order_by(Subject.name)  # noqa: E712
    )).scalars().all()

    result = []
    for subj in subjects:
        # Count total concepts in subject
        total_concepts = (await db.execute(
            select(func.count(Concept.id))
            .join(Topic, Topic.id == Concept.topic_id)
            .where(Topic.subject_id == subj.id, Topic.is_active == True)  # noqa: E712
        )).scalar_one()

        # Count passed checkpoints
        passed = (await db.execute(
            select(func.count(ConceptProgress.id))
            .join(Topic, Topic.id == ConceptProgress.topic_id)
            .where(
                ConceptProgress.user_id == user.id,
                Topic.subject_id == subj.id,
                ConceptProgress.checkpoint_passed == True,  # noqa: E712
            )
        )).scalar_one()

        pct = int((passed / total_concepts * 100)) if total_concepts else 0
        s = subj.serialize()
        s["totalConcepts"] = total_concepts
        s["passedConcepts"] = passed
        s["progressPct"] = pct
        result.append(s)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 2. Topics for a subject
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/subjects/{subject_id}/topics")
async def list_topics_with_progress(
    subject_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    subj = (await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if subj is None:
        raise HTTPException(404, "Subject not found.")

    topics = (await db.execute(
        select(Topic).where(Topic.subject_id == subject_id, Topic.is_active == True)  # noqa: E712
        .order_by(Topic.name)
    )).scalars().all()

    result = []
    for t in topics:
        total_concepts = (await db.execute(
            select(func.count(Concept.id)).where(Concept.topic_id == t.id)
        )).scalar_one()

        passed = (await db.execute(
            select(func.count(ConceptProgress.id)).where(
                ConceptProgress.user_id == user.id,
                ConceptProgress.topic_id == t.id,
                ConceptProgress.checkpoint_passed == True,  # noqa: E712
            )
        )).scalar_one()

        pct = int((passed / total_concepts * 100)) if total_concepts else 0
        row = t.serialize()
        row["subjectName"] = subj.name
        row["totalConcepts"] = total_concepts
        row["passedConcepts"] = passed
        row["progressPct"] = pct
        result.append(row)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 3. Concepts for a topic with per-concept progress
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/topics/{topic_id}/concepts")
async def list_concepts_with_progress(
    topic_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    topic = (await db.execute(
        select(Topic)
        .where(Topic.id == topic_id, Topic.is_active == True)  # noqa: E712
        .options(selectinload(Topic.subject))
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(404, "Topic not found.")

    concepts = (await db.execute(
        select(Concept).where(Concept.topic_id == topic_id).order_by(Concept.id)
    )).scalars().all()

    # Bulk-load progress for this user + topic
    progress_rows = (await db.execute(
        select(ConceptProgress).where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.topic_id == topic_id,
        )
    )).scalars().all()
    progress_by_concept = {p.concept_id: p for p in progress_rows}

    concept_list = []
    for i, c in enumerate(concepts):
        prog = progress_by_concept.get(c.id)
        entry = c.serialize()
        entry["orderIndex"] = i
        entry["progress"] = prog.serialize() if prog else None
        entry["isLocked"] = (
            False if i == 0
            else not (progress_by_concept.get(concepts[i - 1].id, None) and
                      progress_by_concept[concepts[i - 1].id].checkpoint_passed)
        ) if len(concepts) > 1 else False
        concept_list.append(entry)

    passed_count = sum(1 for p in progress_rows if p.checkpoint_passed)
    return {
        "topic": topic.serialize(),
        "subject": topic.subject.serialize() if topic.subject else None,
        "concepts": concept_list,
        "totalConcepts": len(concepts),
        "passedConcepts": passed_count,
        "progressPct": int(passed_count / len(concepts) * 100) if concepts else 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Full lesson content for a concept
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/concepts/{concept_id}/lesson")
async def get_lesson(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    concept = await _get_concept_or_404(db, concept_id)
    topic = await _load_topic_full(db, concept.topic_id)

    # Determine concept order (index within topic)
    all_concepts = sorted(topic.concepts, key=lambda c: c.id)
    concept_index = next((i for i, c in enumerate(all_concepts) if c.id == concept_id), 0)

    cp = await _get_or_create_progress(db, user.id, concept)

    # Mark lesson as viewed
    if cp.lesson_viewed_at is None:
        cp.lesson_viewed_at = _now()
        cp.stage = "lesson"
    await db.commit()
    await db.refresh(cp)

    # Misconceptions for this concept
    misconceptions = [m for m in topic.misconceptions if m.concept_id == concept_id]

    return {
        "concept": concept.serialize(),
        "topic": topic.serialize(),
        "subject": topic.subject.serialize() if topic.subject else None,
        "misconceptions": [m.serialize() for m in misconceptions],
        "objectives": [o.serialize() for o in topic.learning_objectives],
        "conceptIndex": concept_index,
        "totalConcepts": len(all_concepts),
        "progress": cp.serialize(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Checkpoint questions
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/concepts/{concept_id}/checkpoint")
async def get_checkpoint_questions(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    concept = await _get_concept_or_404(db, concept_id)

    # Get questions for this topic (prefer concept-scoped questions)
    all_questions = (await db.execute(
        select(Question)
        .where(Question.topic_id == concept.topic_id)
        .order_by(Question.id)
    )).scalars().all()

    # Filter to MCQ / short answer (not pure explanation) for checkpoint
    checkpoint_qs = [
        q for q in all_questions
        if q.question_type in ("multiple_choice", "short_answer", "numeric")
    ]
    # Limit to 2 questions per checkpoint
    selected = checkpoint_qs[:2] if len(checkpoint_qs) >= 2 else checkpoint_qs

    # Already answered questions for this user+concept
    answered = (await db.execute(
        select(CheckpointAnswer).where(
            CheckpointAnswer.user_id == user.id,
            CheckpointAnswer.concept_id == concept_id,
        )
    )).scalars().all()
    answered_by_qid = {a.question_id: a for a in answered}

    cp = await _get_or_create_progress(db, user.id, concept)
    await db.commit()

    questions_out = []
    for q in selected:
        q_data = q.serialize()
        # Hide answer from frontend (never expose correct answer during attempt)
        q_data.pop("answer", None)
        ans = answered_by_qid.get(q.id)
        q_data["userAnswer"] = ans.response if ans else None
        q_data["isCorrect"] = ans.is_correct if ans else None
        q_data["answered"] = ans is not None
        questions_out.append(q_data)

    return {
        "conceptId": concept_id,
        "conceptName": concept.name,
        "questions": questions_out,
        "totalQuestions": len(selected),
        "answeredCorrect": sum(1 for a in answered_by_qid.values() if a.is_correct and a.question_id in {q.id for q in selected}),
        "checkpointPassed": cp.checkpoint_passed,
        "progress": cp.serialize(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. Submit checkpoint answer
# ─────────────────────────────────────────────────────────────────────────────

class CheckpointAnswerRequest(BaseModel):
    question_id: int
    response: str


@router.post("/solo/concepts/{concept_id}/checkpoint/answer")
async def submit_checkpoint_answer(
    concept_id: int,
    body: CheckpointAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    concept = await _get_concept_or_404(db, concept_id)

    question = (await db.execute(
        select(Question).where(Question.id == body.question_id)
    )).scalar_one_or_none()
    if question is None or question.topic_id != concept.topic_id:
        raise HTTPException(404, "Question not found for this concept's topic.")

    is_correct = _is_correct_answer(question, body.response)

    # Upsert answer (replace previous attempt with latest)
    existing = (await db.execute(
        select(CheckpointAnswer).where(
            CheckpointAnswer.user_id == user.id,
            CheckpointAnswer.concept_id == concept_id,
            CheckpointAnswer.question_id == body.question_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.response = body.response
        existing.is_correct = is_correct
        existing.attempt_number += 1
        existing.answered_at = _now()
    else:
        existing = CheckpointAnswer(
            user_id=user.id,
            concept_id=concept_id,
            question_id=body.question_id,
            response=body.response,
            is_correct=is_correct,
        )
        db.add(existing)

    await db.flush()

    # Check if checkpoint is now passed (all questions correct)
    all_questions = (await db.execute(
        select(Question)
        .where(Question.topic_id == concept.topic_id,
               Question.question_type.in_(["multiple_choice", "short_answer", "numeric"]))
        .order_by(Question.id)
    )).scalars().all()
    selected_qs = all_questions[:2]
    selected_ids = {q.id for q in selected_qs}

    all_answers = (await db.execute(
        select(CheckpointAnswer).where(
            CheckpointAnswer.user_id == user.id,
            CheckpointAnswer.concept_id == concept_id,
            CheckpointAnswer.question_id.in_(selected_ids),
        )
    )).scalars().all()

    correct_count = sum(1 for a in all_answers if a.is_correct)
    total_count = len(selected_qs)
    passed = correct_count >= total_count and total_count > 0

    cp = await _get_or_create_progress(db, user.id, concept)
    cp.checkpoint_score = correct_count
    cp.checkpoint_total = total_count
    if passed and not cp.checkpoint_passed:
        cp.checkpoint_passed = True
        cp.checkpoint_passed_at = _now()
        cp.sync_eligible = True
        cp.stage = "notes"
        # Award XP
        xp_gain = _XP_CHECKPOINT_PASS - cp.xp_awarded
        if xp_gain > 0:
            cp.xp_awarded += xp_gain
            user.xp = (user.xp or 0) + xp_gain
        await progress_service.record_activity(db, user.id)

    await db.commit()

    # Return feedback including the correct answer now
    # Resolve correctAnswer to the full option text (not just the label)
    correct_answer_display = question.answer
    if question.question_type == "multiple_choice" and question.options:
        correct_lower = (question.answer or "").strip().lower()
        for opt in question.options:
            lbl = opt.get("label", "").lower()
            txt = opt.get("text", "").lower()
            if lbl == correct_lower or txt == correct_lower:
                correct_answer_display = opt.get("text", question.answer)
                break

    return {
        "questionId": body.question_id,
        "response": body.response,
        "isCorrect": is_correct,
        "correctAnswer": correct_answer_display,
        "explanation": question.explanation,
        "hint": question.hint,
        "correctCount": correct_count,
        "totalCount": total_count,
        "checkpointPassed": passed,
        "progress": cp.serialize(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. Get concept progress
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/concepts/{concept_id}/progress")
async def get_concept_progress(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    concept = await _get_concept_or_404(db, concept_id)
    cp = await _get_or_create_progress(db, user.id, concept)
    await db.commit()
    return cp.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 8. Submit explanation ("explain in your own words")
# ─────────────────────────────────────────────────────────────────────────────

class ExplanationRequest(BaseModel):
    text: str


@router.post("/solo/concepts/{concept_id}/explanation")
async def submit_explanation(
    concept_id: int,
    body: ExplanationRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    if not body.text or len(body.text.strip()) < 10:
        raise HTTPException(400, "Explanation is too short.")

    concept = await _get_concept_or_404(db, concept_id)
    topic = await _load_topic_full(db, concept.topic_id)

    # Count previous attempts
    prev_attempts = (await db.execute(
        select(ExplanationAttempt).where(
            ExplanationAttempt.user_id == user.id,
            ExplanationAttempt.concept_id == concept_id,
        ).order_by(ExplanationAttempt.created_at)
    )).scalars().all()

    attempt_number = len(prev_attempts) + 1

    # Prepare context for AI
    misconceptions = [m for m in topic.misconceptions if m.concept_id == concept_id]
    concepts_ctx = [concept.serialize()]
    misconceptions_ctx = [m.serialize() for m in misconceptions]
    objectives_ctx = [o.serialize() for o in topic.learning_objectives]
    prev_ctx = [{"response": a.response} for a in prev_attempts[-2:]]  # last 2

    # Call AI
    ai_result = await ai_service.verify_explanation(
        student_response=body.text.strip(),
        topic_name=topic.name,
        subject_name=topic.subject.name if topic.subject else "",
        activity_prompt=f"Explain the concept: {concept.name}",
        concepts=concepts_ctx,
        misconceptions=misconceptions_ctx,
        learning_objectives=objectives_ctx,
        previous_attempts=prev_ctx,
    )

    # Store attempt
    attempt = ExplanationAttempt(
        user_id=user.id,
        concept_id=concept_id,
        topic_id=concept.topic_id,
        response=body.text.strip(),
        attempt_number=attempt_number,
    )

    if ai_result.get("success"):
        r = ai_result["result"]
        attempt.ai_verdict = r["verdict"]
        attempt.ai_score = r["score"]
        attempt.ai_confidence = r["confidence"]
        attempt.ai_feedback = r["feedback"]
        attempt.ai_correct_points = r.get("correct_points", [])
        attempt.ai_missing_points = r.get("missing_points", [])
        attempt.ai_incorrect_points = r.get("incorrect_points", [])
        attempt.ai_misconceptions = r.get("misconceptions_detected", [])
        attempt.ai_provider = ai_result.get("provider")
    else:
        attempt.ai_error = ai_result.get("error", {}).get("message", "AI unavailable")

    db.add(attempt)

    # Update ConceptProgress
    cp = await _get_or_create_progress(db, user.id, concept)
    if ai_result.get("success"):
        r = ai_result["result"]
        cp.explanation_text = body.text.strip()
        cp.explanation_verdict = r["verdict"]
        cp.explanation_score = r["score"]
        cp.explanation_feedback = r["feedback"]
        cp.stage = "ask_ai"

        # Award XP for good explanation
        if r["verdict"] == "correct":
            xp_gain = _XP_EXPLANATION_CORRECT
        elif r["verdict"] == "partial":
            xp_gain = _XP_EXPLANATION_PARTIAL
        else:
            xp_gain = 0
        if xp_gain > 0:
            cp.xp_awarded += xp_gain
            user.xp = (user.xp or 0) + xp_gain

    await db.commit()
    await db.refresh(attempt)

    if not ai_result.get("success"):
        return {
            "success": False,
            "error": ai_result.get("error"),
            "attemptId": attempt.id,
            "attemptNumber": attempt_number,
            "progress": cp.serialize(),
        }

    # Map verdict to human-readable label
    verdict = ai_result["result"]["verdict"]
    label_map = {"correct": "GOOD UNDERSTANDING", "partial": "PARTIAL UNDERSTANDING", "incorrect": "NEEDS REVIEW"}

    return {
        "success": True,
        "attemptId": attempt.id,
        "attemptNumber": attempt_number,
        "verdict": verdict,
        "verdictLabel": label_map.get(verdict, verdict.upper()),
        "score": ai_result["result"]["score"],
        "feedback": ai_result["result"]["feedback"],
        "correctPoints": ai_result["result"].get("correct_points", []),
        "missingPoints": ai_result["result"].get("missing_points", []),
        "incorrectPoints": ai_result["result"].get("incorrect_points", []),
        "misconceptions": ai_result["result"].get("misconceptions_detected", []),
        "hint": ai_result["result"].get("hint"),
        "shouldRetry": ai_result["result"].get("should_retry", False),
        "provider": ai_result.get("provider"),
        "progress": cp.serialize(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9. Ask AI a question about the concept
# ─────────────────────────────────────────────────────────────────────────────

class AskAIRequest(BaseModel):
    question: str


_ASK_AI_SYSTEM = """You are PeerUP's learning assistant. A student is asking a question about a specific curriculum concept.

Rules:
- Answer ONLY based on the supplied curriculum context
- Keep the answer educational, clear, and concise (2-5 sentences)
- Do NOT invent facts beyond the curriculum
- Relate the answer directly to the concept being studied
- Avoid jargon unless it is already in the curriculum
- Return ONLY valid JSON with keys: answer (string), related_concepts (array of strings, up to 3)"""


@router.post("/solo/concepts/{concept_id}/ask")
async def ask_ai(
    concept_id: int,
    body: AskAIRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    if not body.question or len(body.question.strip()) < 3:
        raise HTTPException(400, "Question is too short.")

    concept = await _get_concept_or_404(db, concept_id)
    topic = await _load_topic_full(db, concept.topic_id)

    misconceptions = [m for m in topic.misconceptions if m.concept_id == concept_id]

    prompt = f"""Concept: {concept.name}
Topic: {topic.name}
Subject: {topic.subject.name if topic.subject else ""}

Concept explanation:
{concept.explanation}

Key points:
{chr(10).join(f'- {kp}' for kp in (concept.key_points or []))}

Known misconceptions:
{chr(10).join(f'- {m.misconception}: {m.correction}' for m in misconceptions) or '(none)'}

Student question: "{body.question.strip()}"

Respond with JSON: {{"answer": "...", "related_concepts": ["..."]}}"""

    # Reuse Gemini / Groq infrastructure
    from app.core.config import settings
    import json
    import logging

    logger = logging.getLogger(__name__)
    answer_text = None
    related = []
    provider = None

    if settings.GEMINI_API_KEY:
        try:
            from google import genai
            from google.genai import types
            import asyncio
            
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            
            config = types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
                system_instruction=_ASK_AI_SYSTEM,
            )
            
            def _sync_call():
                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=config,
                )
                return response.text.strip()
            
            text = await asyncio.wait_for(
                asyncio.to_thread(_sync_call),
                timeout=float(settings.AI_REQUEST_TIMEOUT),
            )
            
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            data = json.loads(text)
            answer_text = data.get("answer", "")
            related = data.get("related_concepts", [])
            provider = "gemini"
        except Exception as exc:
            logger.warning("Gemini ask-AI failed: %s", exc)

    if answer_text is None and settings.GROQ_API_KEY:
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=float(settings.AI_REQUEST_TIMEOUT))
            resp = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": _ASK_AI_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            data = json.loads(resp.choices[0].message.content)
            answer_text = data.get("answer", "")
            related = data.get("related_concepts", [])
            provider = "groq"
        except Exception as exc:
            logger.warning("Groq ask-AI failed: %s", exc)

    if answer_text is None:
        return {
            "success": False,
            "error": {
                "code": "AI_UNAVAILABLE",
                "message": "AI is temporarily unavailable. Please try again.",
            },
        }

    # Advance stage to ask_ai at minimum
    cp = await _get_or_create_progress(db, user.id, concept)
    if cp.stage in ("lesson", "checkpoint"):
        cp.stage = "ask_ai"
    await db.commit()

    return {
        "success": True,
        "answer": answer_text,
        "relatedConcepts": related[:3],
        "provider": provider,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 10. Mark checkpoint complete (advance to "passed" stage)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/solo/concepts/{concept_id}/complete")
async def mark_concept_complete(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    concept = await _get_concept_or_404(db, concept_id)
    cp = await _get_or_create_progress(db, user.id, concept)

    if not cp.checkpoint_passed:
        raise HTTPException(400, "Checkpoint must be passed before completing this concept.")

    cp.stage = "passed"
    cp.completed_at = cp.completed_at or _now()
    await db.commit()
    return cp.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 11. Dashboard data
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/dashboard")
async def get_solo_dashboard(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    # Find most recent in-progress concept (lesson viewed but not passed)
    in_progress = (await db.execute(
        select(ConceptProgress)
        .where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.checkpoint_passed == False,  # noqa: E712
            ConceptProgress.lesson_viewed_at != None,    # noqa: E711
        )
        .order_by(ConceptProgress.updated_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    continue_learning = None
    if in_progress:
        concept = (await db.execute(
            select(Concept).where(Concept.id == in_progress.concept_id)
        )).scalar_one_or_none()
        topic = (await db.execute(
            select(Topic)
            .where(Topic.id == in_progress.topic_id)
            .options(selectinload(Topic.subject))
        )).scalar_one_or_none()
        if concept and topic:
            total_concepts = (await db.execute(
                select(func.count(Concept.id)).where(Concept.topic_id == topic.id)
            )).scalar_one()
            passed_in_topic = (await db.execute(
                select(func.count(ConceptProgress.id)).where(
                    ConceptProgress.user_id == user.id,
                    ConceptProgress.topic_id == topic.id,
                    ConceptProgress.checkpoint_passed == True,  # noqa: E712
                )
            )).scalar_one()
            concept_index = (await db.execute(
                select(func.count(Concept.id)).where(
                    Concept.topic_id == topic.id,
                    Concept.id < concept.id,
                )
            )).scalar_one()
            continue_learning = {
                "conceptId": concept.id,
                "conceptName": concept.name,
                "topicId": topic.id,
                "topicName": topic.name,
                "subjectName": topic.subject.name if topic.subject else "",
                "conceptIndex": concept_index + 1,
                "totalConcepts": total_concepts,
                "passedConcepts": passed_in_topic,
                "progressPct": int(passed_in_topic / total_concepts * 100) if total_concepts else 0,
                "stage": in_progress.stage,
            }

    # Find concepts eligible for sync (checkpoint passed, sync not completed)
    sync_ready = (await db.execute(
        select(ConceptProgress)
        .where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.sync_eligible == True,   # noqa: E712
            ConceptProgress.sync_completed == False,  # noqa: E712
        )
        .order_by(ConceptProgress.checkpoint_passed_at.desc())
        .limit(3)
    )).scalars().all()

    sync_ready_list = []
    for cp in sync_ready:
        concept = (await db.execute(
            select(Concept).where(Concept.id == cp.concept_id)
        )).scalar_one_or_none()
        topic = (await db.execute(
            select(Topic)
            .where(Topic.id == cp.topic_id)
            .options(selectinload(Topic.subject))
        )).scalar_one_or_none()
        if concept and topic:
            # Count how many OTHER users are also sync-eligible for same concept
            partner_count = (await db.execute(
                select(func.count(ConceptProgress.id)).where(
                    ConceptProgress.concept_id == cp.concept_id,
                    ConceptProgress.sync_eligible == True,    # noqa: E712
                    ConceptProgress.sync_completed == False,  # noqa: E712
                    ConceptProgress.user_id != user.id,
                )
            )).scalar_one()
            sync_ready_list.append({
                "conceptId": cp.concept_id,
                "conceptName": concept.name,
                "topicId": cp.topic_id,
                "topicName": topic.name,
                "subjectName": topic.subject.name if topic.subject else "",
                "checkpointPassedAt": cp.checkpoint_passed_at.isoformat() if cp.checkpoint_passed_at else None,
                "availablePartners": partner_count,
            })

    # Recent activity (last 5 events)
    recent_progress = (await db.execute(
        select(ConceptProgress)
        .where(ConceptProgress.user_id == user.id)
        .order_by(ConceptProgress.updated_at.desc())
        .limit(10)
    )).scalars().all()

    activity = []
    for cp in recent_progress:
        concept = (await db.execute(
            select(Concept).where(Concept.id == cp.concept_id)
        )).scalar_one_or_none()
        if not concept:
            continue
        if cp.checkpoint_passed:
            activity.append({
                "type": "checkpoint_passed",
                "label": f"You completed a checkpoint.",
                "detail": concept.name,
                "at": cp.checkpoint_passed_at.isoformat() if cp.checkpoint_passed_at else cp.updated_at.isoformat(),
            })
        elif cp.lesson_viewed_at:
            activity.append({
                "type": "lesson_viewed",
                "label": f"You started learning.",
                "detail": concept.name,
                "at": cp.lesson_viewed_at.isoformat(),
            })

    # Include sync completions
    from app.models.solo_learning import SyncSession
    sync_completed = (await db.execute(
        select(SyncSession)
        .where(
            ((SyncSession.initiator_id == user.id) | (SyncSession.partner_id == user.id)),
            SyncSession.phase == "COMPLETED",
        )
        .order_by(SyncSession.completed_at.desc())
        .limit(5)
    )).scalars().all()

    for ss in sync_completed:
        concept = (await db.execute(
            select(Concept).where(Concept.id == ss.concept_id)
        )).scalar_one_or_none()
        if concept:
            activity.append({
                "type": "sync_completed",
                "label": "You completed a Sync.",
                "detail": concept.name,
                "at": ss.completed_at.isoformat() if ss.completed_at else ss.updated_at.isoformat(),
            })

    # Sort activity by date descending and limit
    activity.sort(key=lambda x: x["at"], reverse=True)
    activity = activity[:8]

    return {
        "continueLearning": continue_learning,
        "syncReady": sync_ready_list,
        "recentActivity": activity,
        "xp": user.xp or 0,
        "streak": user.streak_days or 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 12. Suggested "Ask AI" questions for a concept
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/solo/concepts/{concept_id}/suggested-questions")
async def get_suggested_questions(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    concept = await _get_concept_or_404(db, concept_id)
    # Build suggestions from key_points and misconceptions
    topic = await _load_topic_full(db, concept.topic_id)
    suggestions = []
    for kp in (concept.key_points or [])[:2]:
        suggestions.append(f"Can you explain more about: {kp}?")
    misconceptions = [m for m in topic.misconceptions if m.concept_id == concept_id]
    for m in misconceptions[:2]:
        suggestions.append(f"Is it true that {m.misconception}?")
    # Generic fallbacks
    suggestions += [
        f"How does {concept.name} apply in real life?",
        f"What is the most important thing to remember about {concept.name}?",
        f"What are common mistakes students make about {concept.name}?",
    ]
    return suggestions[:5]
