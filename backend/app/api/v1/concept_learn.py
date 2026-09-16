"""
Sequential Concept Learning API

Pipeline: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified

Every endpoint enforces backend stage authorization.
The frontend is never the authority on progression.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from google import genai
from google.genai import types
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.dependencies import current_user as get_current_user
from app.models.concept_progress import ConceptProgress
from app.models.curriculum import Concept, LearningObjective, Misconception, Subject, Topic
from app.models.user import User
from app.services.ai_service import verify_explanation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/concepts", tags=["concept-learning"])

# Stage order — never change the order; only append new stages at the end
STAGE_ORDER = ["lesson", "checkpoint", "explain", "ai_verification", "ask_ai", "challenge", "verified"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Pydantic request models ──────────────────────────────────────────────────

class SubmitCheckpointRequest(BaseModel):
    answers: dict[str, str]        # {"0": "A", "1": "B", ...}
    checkpoint: dict               # The checkpoint data that was shown

class GenerateReteachingRequest(BaseModel):
    missedKeyPoints: list[str] = []

class SubmitExplanationRequest(BaseModel):
    explanation: str

class AskAIRequest(BaseModel):
    question: str

class VerifyConceptRequest(BaseModel):
    challengeSessionId: int

class ChallengeFailedRequest(BaseModel):
    conceptId: int
    missedKeyPoints: list[str] = []


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_or_create_progress(db: AsyncSession, user_id: int, concept_id: int) -> ConceptProgress:
    result = await db.execute(
        select(ConceptProgress)
        .where(ConceptProgress.user_id == user_id)
        .where(ConceptProgress.concept_id == concept_id)
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = ConceptProgress(user_id=user_id, concept_id=concept_id, current_stage="lesson")
        db.add(progress)
        await db.commit()
        await db.refresh(progress)
    return progress


def _stage_index(stage: str) -> int:
    try:
        return STAGE_ORDER.index(stage)
    except ValueError:
        return 0


def _require_stage(progress: ConceptProgress, minimum_stage: str, action: str = "this action") -> None:
    """Raise 403 if user has not yet reached minimum_stage."""
    if progress.verified:
        return  # verified users can re-access anything
    current_idx = _stage_index(progress.current_stage)
    required_idx = _stage_index(minimum_stage)
    if current_idx < required_idx:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You must complete '{STAGE_ORDER[required_idx - 1]}' before {action}. "
                   f"Current stage: '{progress.current_stage}'.",
        )


def _require_current_stage(progress: ConceptProgress, expected_stage: str, action: str = "this action") -> None:
    """Raise 403 if user is not at exactly expected_stage (unless verified)."""
    if progress.verified:
        return
    if progress.current_stage != expected_stage:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires stage '{expected_stage}'. "
                   f"Current stage: '{progress.current_stage}'.",
        )


async def _get_concept_context(db: AsyncSession, concept_id: int):
    """Load concept, topic, subject or raise 404."""
    result = await db.execute(
        select(Concept, Topic, Subject)
        .join(Topic, Concept.topic_id == Topic.id)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Concept.id == concept_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Concept not found.")
    return row  # (concept, topic, subject)


def _call_gemini(prompt: str, temperature: float = 0.7, json_mode: bool = True) -> dict | str:
    """Synchronous Gemini call — run in a thread via asyncio.to_thread."""
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    config = types.GenerateContentConfig(
        temperature=temperature,
        response_mime_type="application/json" if json_mode else "text/plain",
    )
    
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=config,
    )
    
    text = response.text.strip()
    if json_mode:
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    return text


async def _gemini(prompt: str, temperature: float = 0.7, json_mode: bool = True) -> dict | str:
    """Async wrapper around Gemini with timeout."""
    timeout = float(getattr(settings, "AI_REQUEST_TIMEOUT", 60))
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_call_gemini, prompt, temperature, json_mode),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI request timed out. Please try again.",
        )
    except Exception as exc:
        logger.exception("Gemini error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI is temporarily unavailable. Please try again later.",
        )


# ─── 1. GET /concepts/{id}/progress ──────────────────────────────────────────

@router.get("/{concept_id}/progress")
async def get_concept_progress(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return current progress — creates a fresh record at 'lesson' if none exists."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)

    # Check what the previous concept is and whether this one is unlocked
    # Concepts in a topic are ordered by id (creation order)
    all_concepts_result = await db.execute(
        select(Concept).where(Concept.topic_id == concept.topic_id).order_by(Concept.id)
    )
    all_concepts = all_concepts_result.scalars().all()
    concept_ids = [c.id for c in all_concepts]
    my_idx = concept_ids.index(concept_id) if concept_id in concept_ids else 0

    # First concept is always accessible; subsequent ones need the previous VERIFIED
    if my_idx > 0:
        prev_id = concept_ids[my_idx - 1]
        prev_result = await db.execute(
            select(ConceptProgress)
            .where(ConceptProgress.user_id == current_user.id)
            .where(ConceptProgress.concept_id == prev_id)
        )
        prev_progress = prev_result.scalar_one_or_none()
        if not prev_progress or not prev_progress.verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Complete and verify the previous concept before starting this one.",
            )

    return {
        "ok": True,
        "concept": concept.serialize(),
        "topic": {"id": topic.id, "name": topic.name},
        "subject": {"id": subject.id, "name": subject.name},
        "progress": progress.serialize(),
        "lockedStages": progress.get_locked_stages(),
    }


# ─── 2. POST /concepts/{id}/generate-lesson ──────────────────────────────────

@router.post("/{concept_id}/generate-lesson")
async def generate_lesson(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Generate and save the AI lesson. Allowed at 'lesson' stage only."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "lesson", "generating a lesson")

    # If lesson already generated, return it
    if progress.lesson_content:
        return {"ok": True, "lesson": progress.lesson_content, "cached": True}

    sub_concepts_text = "\n".join(f"- {kp}" for kp in (concept.key_points or []))

    prompt = f"""You are an expert teacher creating a focused lesson for students.

Subject: {subject.name}
Topic: {topic.name}
Concept: {concept.name}

Concept Explanation:
{concept.explanation}

Sub-Concepts to cover:
{sub_concepts_text or "(None listed — teach the concept as a whole)"}

TASK:
Create a 5-10 minute lesson that teaches this concept clearly and engagingly.

REQUIREMENTS:
1. Start with a brief introduction
2. Explain each sub-concept with clear language
3. Include 1-2 concrete examples or analogies
4. Keep it focused — do not introduce unrelated concepts
5. ~300-500 words
6. This lesson WILL be used verbatim to generate checkpoint questions,
   so make sure every key point is clearly stated.

Return ONLY valid JSON:
{{
  "title": "Lesson title",
  "introduction": "Brief intro paragraph",
  "sections": [
    {{
      "heading": "Section heading",
      "content": "Teaching content",
      "keyPoints": ["point 1", "point 2"]
    }}
  ],
  "examples": [
    {{
      "title": "Example 1",
      "description": "Worked example or analogy"
    }}
  ],
  "summary": "What the student should now understand"
}}"""

    lesson = await _gemini(prompt, temperature=0.7)
    lesson["generatedAt"] = _now().isoformat()
    lesson["conceptId"] = concept_id

    progress.lesson_content = lesson
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Lesson generated: concept=%d user=%d", concept_id, current_user.id)
    return {"ok": True, "lesson": lesson}


# ─── 3. POST /concepts/{id}/complete-lesson ──────────────────────────────────

@router.post("/{concept_id}/complete-lesson")
async def complete_lesson(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark lesson read; advance to 'checkpoint'."""
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "lesson", "completing the lesson")

    if not progress.lesson_content:
        raise HTTPException(status_code=400, detail="Generate the lesson first.")

    progress.lesson_completed = True
    progress.lesson_completed_at = _now()
    progress.current_stage = "checkpoint"
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Lesson completed: concept=%d user=%d", concept_id, current_user.id)
    return {"ok": True, "message": "Lesson completed. Checkpoint unlocked.", "progress": progress.serialize()}


# ─── 4. POST /concepts/{id}/generate-checkpoint ──────────────────────────────

@router.post("/{concept_id}/generate-checkpoint")
async def generate_checkpoint(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Generate checkpoint questions FROM the saved lesson. Checkpoint stage only."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "generating a checkpoint")

    # CRITICAL: lesson_content MUST exist — do not fall back to concept name
    if not progress.lesson_content:
        raise HTTPException(
            status_code=400,
            detail="No lesson content found. Complete the lesson step first so the "
                   "checkpoint can be generated from it.",
        )

    # Determine source: use reteaching content if available (after failure)
    source_lesson = progress.reteaching_content or progress.lesson_content
    source_label = "reteaching lesson" if progress.reteaching_content else "original lesson"

    lesson_json = json.dumps(source_lesson, indent=2)

    prompt = f"""You are creating a checkpoint to test what a student learned in a specific lesson.

Subject: {subject.name}
Topic: {topic.name}
Concept: {concept.name}

THE {source_label.upper()} THAT WAS TAUGHT:
{lesson_json}

CRITICAL REQUIREMENTS:
- Generate exactly 3 multiple-choice questions
- Questions MUST test ONLY content that appears in the lesson above
- Do NOT ask about anything not covered in the lesson
- Do NOT assume prior knowledge beyond what the lesson taught
- Each question must have exactly 4 options: A, B, C, D
- correctAnswer must be exactly "A", "B", "C", or "D"
- testsKeyPoint: quote the specific sentence or key point from the lesson this tests

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "type": "multiple_choice",
      "options": {{"A": "option text", "B": "option text", "C": "option text", "D": "option text"}},
      "correctAnswer": "A",
      "explanation": "Why A is correct and others are not",
      "difficulty": "easy"|"medium"|"hard",
      "testsKeyPoint": "exact key point from lesson"
    }}
  ],
  "passingScore": 67,
  "sourceLesson": "{source_label}"
}}"""

    checkpoint = await _gemini(prompt, temperature=0.3)
    checkpoint["generatedAt"] = _now().isoformat()
    checkpoint["basedOnLesson"] = True
    checkpoint["sourceLessonType"] = source_label

    logger.info("Checkpoint generated: concept=%d user=%d source=%s",
                concept_id, current_user.id, source_label)
    return {"ok": True, "checkpoint": checkpoint}


# ─── 5. POST /concepts/{id}/submit-checkpoint ────────────────────────────────

@router.post("/{concept_id}/submit-checkpoint")
async def submit_checkpoint(
    concept_id: int,
    body: SubmitCheckpointRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Evaluate checkpoint answers. Pass → explain; Fail → reteach."""
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "submitting checkpoint answers")

    questions = body.checkpoint.get("questions", [])
    passing_score = body.checkpoint.get("passingScore", 67)

    if not questions:
        raise HTTPException(status_code=400, detail="Checkpoint data is empty.")

    results = []
    correct_count = 0
    missed_key_points = []

    for idx, q in enumerate(questions):
        user_ans = body.answers.get(str(idx), "").strip().upper()
        correct_ans = q.get("correctAnswer", "").strip().upper()
        is_correct = user_ans == correct_ans
        if is_correct:
            correct_count += 1
        else:
            kp = q.get("testsKeyPoint", "")
            if kp:
                missed_key_points.append(kp)
        results.append({
            "questionIndex": idx,
            "question": q.get("question"),
            "userAnswer": user_ans,
            "correctAnswer": correct_ans,
            "isCorrect": is_correct,
            "explanation": q.get("explanation"),
        })

    score = int((correct_count / len(questions)) * 100) if questions else 0
    passed = score >= passing_score

    attempt_record = {
        "timestamp": _now().isoformat(),
        "answers": body.answers,
        "results": results,
        "score": score,
        "passed": passed,
        "checkpointMeta": {
            "sourceLessonType": body.checkpoint.get("sourceLessonType", "original"),
            "passingScore": passing_score,
        },
    }
    progress.checkpoint_attempts = list(progress.checkpoint_attempts or []) + [attempt_record]

    if passed:
        progress.checkpoint_passed = True
        progress.checkpoint_passed_at = _now()
        # Clear any reteaching content so next checkpoint uses original lesson
        progress.reteaching_content = None
        progress.current_stage = "explain"
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        logger.info("Checkpoint passed: concept=%d user=%d score=%d", concept_id, current_user.id, score)
        return {
            "ok": True, "passed": True, "score": score, "results": results,
            "message": "Checkpoint passed! Explain It unlocked.",
            "progress": progress.serialize(),
        }
    else:
        progress.reteaching_count = (progress.reteaching_count or 0) + 1
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        logger.info("Checkpoint failed: concept=%d user=%d score=%d", concept_id, current_user.id, score)
        return {
            "ok": True, "passed": False, "score": score, "results": results,
            "message": f"Score {score}% — need {passing_score}% to pass.",
            "needsReteaching": True,
            "missedKeyPoints": list(dict.fromkeys(missed_key_points)),  # deduplicated, ordered
            "attemptNumber": len(progress.checkpoint_attempts),
        }


# ─── 6. POST /concepts/{id}/generate-reteaching ──────────────────────────────

@router.post("/{concept_id}/generate-reteaching")
async def generate_reteaching(
    concept_id: int,
    body: GenerateReteachingRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a simpler, focused re-lesson for the points the student missed.
    Saved reteaching_content will be used as the source for the NEXT checkpoint.
    """
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "generating reteaching")

    if not progress.lesson_content:
        raise HTTPException(status_code=400, detail="No original lesson found.")
    if not progress.checkpoint_attempts:
        raise HTTPException(status_code=400, detail="No checkpoint attempt found to reteach from.")

    missed_text = "\n".join(f"- {p}" for p in body.missedKeyPoints) or "(general difficulty with the concept)"
    original_lesson = json.dumps(progress.lesson_content, indent=2)

    prompt = f"""A student failed a checkpoint on this concept. Create a simpler, focused reteaching lesson.

Subject: {subject.name}
Topic: {topic.name}
Concept: {concept.name}

ORIGINAL LESSON:
{original_lesson}

WHAT THE STUDENT STRUGGLED WITH:
{missed_text}

TASK: Create a shorter, simpler lesson (200-300 words) that:
1. Focuses ONLY on the missed points
2. Uses different, simpler examples than the original
3. Breaks difficult parts into smaller steps
4. Uses plain language
5. MUST cover the content clearly so a new checkpoint from this lesson can be answered

This new lesson content will become the source for a fresh checkpoint.
Make the content testable — every key point should be clearly stated.

Return valid JSON:
{{
  "title": "Let's revisit this together",
  "introduction": "Short, encouraging intro",
  "sections": [
    {{
      "heading": "Section heading",
      "content": "Simpler explanation",
      "keyPoints": ["simplified key point"]
    }}
  ],
  "examples": [
    {{
      "title": "A new example",
      "description": "Concrete, relatable example"
    }}
  ],
  "summary": "What to remember"
}}"""

    reteaching = await _gemini(prompt, temperature=0.7)
    reteaching["generatedAt"] = _now().isoformat()
    reteaching["isReteaching"] = True
    reteaching["attemptNumber"] = progress.reteaching_count

    progress.reteaching_content = reteaching
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Reteaching generated: concept=%d user=%d attempt=%d",
                concept_id, current_user.id, progress.reteaching_count)
    return {"ok": True, "reteaching": reteaching}


# ─── 7. POST /concepts/{id}/submit-explanation ───────────────────────────────

@router.post("/{concept_id}/submit-explanation")
async def submit_explanation(
    concept_id: int,
    body: SubmitExplanationRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Submit the student's explanation; AI verifies conceptual understanding."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "explain", "submitting an explanation")

    if not progress.checkpoint_passed:
        raise HTTPException(status_code=403, detail="Must pass checkpoint first.")

    if not body.explanation or len(body.explanation.strip()) < 20:
        raise HTTPException(status_code=400, detail="Explanation is too short.")

    # Build context for AI verifier
    misconceptions_result = await db.execute(
        select(Misconception).where(Misconception.concept_id == concept_id)
    )
    misconceptions = misconceptions_result.scalars().all()

    objectives_result = await db.execute(
        select(LearningObjective).where(LearningObjective.topic_id == topic.id)
    )
    objectives = objectives_result.scalars().all()

    concepts_ctx = [{"name": concept.name, "explanation": concept.explanation, "keyPoints": concept.key_points or []}]
    misconceptions_ctx = [{"misconception": m.misconception, "correction": m.correction} for m in misconceptions]
    objectives_ctx = [{"title": o.title, "description": o.description} for o in objectives]
    previous_attempts = [{"response": a.get("explanation", "")} for a in (progress.explanation_attempts or [])]

    try:
        ai_result = await verify_explanation(
            student_response=body.explanation,
            topic_name=topic.name,
            subject_name=subject.name,
            activity_prompt="Explain this concept in your own words",
            concepts=concepts_ctx,
            misconceptions=misconceptions_ctx,
            learning_objectives=objectives_ctx,
            previous_attempts=previous_attempts,
        )
    except Exception as exc:
        logger.exception("verify_explanation failed: %s", exc)
        # Save explanation as pending — AI unavailable path
        attempt_record = {
            "timestamp": _now().isoformat(),
            "explanation": body.explanation,
            "aiResult": None,
            "status": "ai_unavailable",
        }
        progress.explanation_attempts = list(progress.explanation_attempts or []) + [attempt_record]
        progress.updated_at = _now()
        await db.commit()
        return {
            "ok": False,
            "aiUnavailable": True,
            "message": "AI verification is temporarily unavailable. Your response has been saved. "
                       "You can continue and return to this activity later.",
        }

    attempt_record = {
        "timestamp": _now().isoformat(),
        "explanation": body.explanation,
        "aiResult": ai_result,
    }
    progress.explanation_attempts = list(progress.explanation_attempts or []) + [attempt_record]

    result_data = ai_result.get("result", {}) if ai_result.get("success") else {}
    verdict = result_data.get("verdict", "incorrect")
    demonstrated = result_data.get("demonstrated_understanding", False)
    passed = verdict == "correct" and demonstrated

    if passed:
        progress.explanation_passed = True
        progress.explanation_passed_at = _now()
        progress.ai_verification_result = result_data
        progress.ai_verification_passed = True
        progress.ai_verification_at = _now()
        progress.challenge_eligible = True
        progress.current_stage = "ask_ai"
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        logger.info("Explanation verified: concept=%d user=%d", concept_id, current_user.id)
        return {
            "ok": True, "passed": True, "verdict": verdict,
            "aiResult": result_data,
            "message": "Great explanation! You're now eligible for the Challenge.",
            "progress": progress.serialize(),
        }
    else:
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        return {
            "ok": True, "passed": False, "verdict": verdict,
            "aiResult": result_data,
            "shouldRetry": result_data.get("should_retry", True),
            "message": "Your explanation needs more detail. Review the feedback and try again.",
        }


# ─── 8. POST /concepts/{id}/ask-ai ───────────────────────────────────────────

@router.post("/{concept_id}/ask-ai")
async def ask_ai_question(
    concept_id: int,
    body: AskAIRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Curriculum-bound Q&A. Requires ask_ai stage or later."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_stage(progress, "ask_ai", "using Ask AI")

    if not body.question or len(body.question.strip()) < 3:
        raise HTTPException(status_code=400, detail="Question is too short.")

    key_points_text = "\n".join(f"- {kp}" for kp in (concept.key_points or []))
    lesson_text = json.dumps(progress.lesson_content or {}, indent=2)

    prompt = f"""You are a helpful tutor for a student studying this concept.

Subject: {subject.name}
Topic: {topic.name}
Concept: {concept.name}

Concept Explanation:
{concept.explanation}

Key Points:
{key_points_text}

What was taught in the lesson:
{lesson_text}

RULES:
1. Answer ONLY based on the curriculum content above
2. Do NOT introduce concepts from future lessons
3. Keep answers clear, concise, student-friendly (max 200 words)
4. If the question is completely outside the concept scope, redirect politely

Student's question: "{body.question.strip()}"

Answer:"""

    answer = await _gemini(prompt, temperature=0.7, json_mode=False)

    qa_entry = {
        "timestamp": _now().isoformat(),
        "question": body.question,
        "answer": answer,
    }
    progress.ask_ai_questions = list(progress.ask_ai_questions or []) + [qa_entry]
    progress.updated_at = _now()
    await db.commit()

    return {"ok": True, "answer": answer, "question": body.question}


# ─── 9. POST /concepts/{id}/verify-concept ───────────────────────────────────

@router.post("/{concept_id}/verify-concept")
async def verify_concept(
    concept_id: int,
    body: VerifyConceptRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark concept VERIFIED after a successful Challenge. Unlocks next concept."""
    concept, topic, _ = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)

    if not progress.challenge_eligible:
        raise HTTPException(status_code=403, detail="Not challenge-eligible yet.")

    progress.challenge_session_id = body.challengeSessionId
    progress.challenge_passed = True
    progress.challenge_passed_at = _now()
    progress.verified = True
    progress.verified_at = _now()
    progress.current_stage = "verified"
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Concept verified: concept=%d user=%d session=%d",
                concept_id, current_user.id, body.challengeSessionId)
    return {
        "ok": True,
        "message": "Concept verified! Next concept unlocked.",
        "progress": progress.serialize(),
    }


# ─── 10. POST /concepts/{id}/challenge-failed ────────────────────────────────

@router.post("/{concept_id}/challenge-failed")
async def challenge_failed(
    concept_id: int,
    body: ChallengeFailedRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Called when a student fails a Challenge.
    Resets back to checkpoint stage for reteaching.
    Does NOT lock them out — they can retry.
    """
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)

    if not progress.challenge_eligible:
        raise HTTPException(status_code=403, detail="No active challenge found.")

    # Reset to checkpoint to go through reteach → new checkpoint → explain → challenge
    progress.checkpoint_passed = False
    progress.checkpoint_passed_at = None
    progress.explanation_passed = False
    progress.explanation_passed_at = None
    progress.ai_verification_passed = False
    progress.ai_verification_at = None
    progress.ai_verification_result = None
    progress.challenge_eligible = False
    progress.reteaching_count = (progress.reteaching_count or 0) + 1
    progress.current_stage = "checkpoint"
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Challenge failed, reset to checkpoint: concept=%d user=%d", concept_id, current_user.id)
    return {
        "ok": True,
        "message": "Let's identify the gaps and work through them again.",
        "nextAction": "generate-reteaching",
        "missedKeyPoints": body.missedKeyPoints,
        "progress": progress.serialize(),
    }


# ─── 11. GET /concepts/{id}/history ──────────────────────────────────────────

@router.get("/{concept_id}/history")
async def get_concept_history(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Full learning history for this concept."""
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    return {"ok": True, "history": progress.serialize()}


# ─── 12. GET /topics/{topic_id}/concepts-with-progress ───────────────────────

@router.get("/topic/{topic_id}/concepts")
async def get_topic_concepts_with_progress(
    topic_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all concepts for a topic with the user's lock/progress state.
    Used by the Topic page to render concept cards with correct states.
    """
    # Load topic + subject
    topic_result = await db.execute(
        select(Topic, Subject)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Topic.id == topic_id)
    )
    topic_row = topic_result.one_or_none()
    if not topic_row:
        raise HTTPException(status_code=404, detail="Topic not found.")
    topic, subject = topic_row

    # Load all concepts ordered by id (creation order = curriculum order)
    concepts_result = await db.execute(
        select(Concept).where(Concept.topic_id == topic_id).order_by(Concept.id)
    )
    concepts = concepts_result.scalars().all()

    # Load all progress records for this user in one query
    if concepts:
        concept_ids = [c.id for c in concepts]
        progress_result = await db.execute(
            select(ConceptProgress)
            .where(ConceptProgress.user_id == current_user.id)
            .where(ConceptProgress.concept_id.in_(concept_ids))
        )
        progress_map: dict[int, ConceptProgress] = {
            p.concept_id: p for p in progress_result.scalars().all()
        }
    else:
        progress_map = {}

    # Build concept list with lock state
    concept_list = []
    for i, c in enumerate(concepts):
        prog = progress_map.get(c.id)

        # Lock logic: first concept always unlocked; nth concept requires (n-1) verified
        if i == 0:
            is_locked = False
        else:
            prev = progress_map.get(concepts[i - 1].id)
            is_locked = not (prev and prev.verified)

        # Determine display status
        if prog and prog.verified:
            display_status = "verified"
        elif prog and prog.current_stage not in (None, "lesson") and not is_locked:
            display_status = "in_progress"
        elif not is_locked:
            display_status = "available"
        else:
            display_status = "locked"

        concept_list.append({
            **c.serialize(),
            "isLocked": is_locked,
            "displayStatus": display_status,
            "currentStage": prog.current_stage if prog else None,
            "verified": prog.verified if prog else False,
            "challengeEligible": prog.challenge_eligible if prog else False,
        })

    total = len(concept_list)
    verified_count = sum(1 for c in concept_list if c["verified"])

    return {
        "ok": True,
        "topic": topic.serialize(),
        "subject": {"id": subject.id, "name": subject.name},
        "concepts": concept_list,
        "totalConcepts": total,
        "verifiedConcepts": verified_count,
        "progressPct": int((verified_count / total) * 100) if total else 0,
    }
