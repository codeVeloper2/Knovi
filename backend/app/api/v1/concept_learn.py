"""
Sequential Concept Learning API

Pipeline: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified

Every endpoint enforces backend stage authorization.
The frontend is never the authority on progression.

AI generation uses the centralized ai_service.py with Gemini→Groq fallback.
Lesson content is persisted before the checkpoint is generated.
Checkpoint questions are cached in DB so page refresh doesn't lose them.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.dependencies import current_user as get_current_user
from app.models.concept_progress import ConceptProgress
from app.models.curriculum import Concept, LearningObjective, Misconception, Subject, Topic
from app.models.user import User
from app.services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/concepts", tags=["concept-learning"])

# Stage order — append-only; never reorder
STAGE_ORDER = ["lesson", "checkpoint", "explain", "ai_verification", "ask_ai", "challenge", "verified"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Pydantic request models ──────────────────────────────────────────────────

class GenerateReteachingRequest(BaseModel):
    missedKeyPoints: list[str] = []

class SubmitCheckpointRequest(BaseModel):
    answers: dict[str, str]   # {"0": "A", "1": "B", "2": "C"}

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
        return
    current_idx = _stage_index(progress.current_stage)
    required_idx = _stage_index(minimum_stage)
    if current_idx < required_idx:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You must complete '{STAGE_ORDER[required_idx - 1]}' before {action}. "
                f"Current stage: '{progress.current_stage}'."
            ),
        )


def _require_current_stage(progress: ConceptProgress, expected_stage: str, action: str = "this action") -> None:
    """Raise 403 if user is not at exactly expected_stage (unless verified)."""
    if progress.verified:
        return
    if progress.current_stage != expected_stage:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This action requires stage '{expected_stage}'. "
                f"Current stage: '{progress.current_stage}'."
            ),
        )


async def _get_concept_context(db: AsyncSession, concept_id: int):
    """Load concept + topic + subject or raise 404."""
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


async def _build_curriculum_context(db: AsyncSession, concept: Concept, topic: Topic, subject: Subject) -> dict:
    """Build the full curriculum context dict for AI generation."""
    # Load learning objectives for this topic
    obj_result = await db.execute(
        select(LearningObjective)
        .where(LearningObjective.topic_id == topic.id)
        .order_by(LearningObjective.order_index)
    )
    objectives = obj_result.scalars().all()

    # Load misconceptions for this concept (and topic-level ones)
    misc_result = await db.execute(
        select(Misconception).where(
            (Misconception.concept_id == concept.id) |
            ((Misconception.concept_id.is_(None)) & (Misconception.topic_id == topic.id))
        )
    )
    misconceptions = misc_result.scalars().all()

    return {
        "subject_name": subject.name,
        "subject_description": subject.description or "",
        "topic_name": topic.name,
        "topic_description": topic.description or "",
        "topic_difficulty": topic.difficulty or "",
        "concept_name": concept.name,
        "concept_explanation": concept.explanation,
        "key_points": list(concept.key_points or []),
        "objectives": [o.title for o in objectives],
        "misconceptions": [
            {"misconception": m.misconception, "correction": m.correction}
            for m in misconceptions
        ],
    }


# ─── 1. GET /concepts/{id}/progress ──────────────────────────────────────────

@router.get("/{concept_id}/progress")
async def get_concept_progress(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return current progress; creates fresh record at 'lesson' if none exists.
    Enforces sequential concept unlock: previous concept must be verified first.
    """
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)

    # Enforce sequential unlock: previous concept must be verified
    all_concepts_result = await db.execute(
        select(Concept).where(Concept.topic_id == concept.topic_id).order_by(Concept.id)
    )
    all_concepts = all_concepts_result.scalars().all()
    concept_ids = [c.id for c in all_concepts]
    my_idx = concept_ids.index(concept_id) if concept_id in concept_ids else 0

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
        "topic": {"id": topic.id, "name": topic.name, "description": topic.description},
        "subject": {"id": subject.id, "name": subject.name, "description": subject.description},
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
    """Generate and persist an AI lesson. Returns cached lesson on repeat calls."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "lesson", "generating a lesson")

    # Return cached lesson if already generated
    if progress.lesson_content:
        return {
            "ok": True,
            "lesson": progress.lesson_content,
            "cached": True,
            "subject": subject.name,
            "topic": topic.name,
            "concept": concept.name,
        }

    # Build full curriculum context
    ctx = await _build_curriculum_context(db, concept, topic, subject)

    result = await ai_service.generate_lesson(ctx)
    if not result["success"]:
        raise HTTPException(
            status_code=503,
            detail=result["error"]["message"],
        )

    lesson = result["lesson"]
    lesson["generatedAt"] = _now().isoformat()
    lesson["conceptId"] = concept_id
    lesson["aiProvider"] = result["provider"]

    # Save lesson AND curriculum snapshot
    progress.lesson_content = lesson
    progress.curriculum_snapshot = {
        k: v for k, v in ctx.items()
        if k not in ("is_reteach", "missed_points", "previous_lesson")
    }
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Lesson generated: concept=%d user=%d provider=%s", concept_id, current_user.id, result["provider"])
    return {
        "ok": True,
        "lesson": lesson,
        "cached": False,
        "subject": subject.name,
        "topic": topic.name,
        "concept": concept.name,
    }


# ─── 3. POST /concepts/{id}/complete-lesson ──────────────────────────────────

@router.post("/{concept_id}/complete-lesson")
async def complete_lesson(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark lesson read; advance to 'checkpoint' stage."""
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
    return {
        "ok": True,
        "message": "Lesson completed. Checkpoint unlocked.",
        "progress": progress.serialize(),
    }


# ─── 4. POST /concepts/{id}/generate-checkpoint ──────────────────────────────

@router.post("/{concept_id}/generate-checkpoint")
async def generate_checkpoint(
    concept_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Generate and PERSIST checkpoint questions from the saved lesson.
    
    Returns cached checkpoint if one was already generated for this stage.
    After checkpoint_passed, this resets so reteaching creates a new checkpoint.
    """
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "generating a checkpoint")

    if not progress.lesson_content:
        raise HTTPException(
            status_code=400,
            detail="No lesson content found. Complete the lesson step first.",
        )

    # Return cached checkpoint if already generated (and not yet passed)
    if progress.checkpoint_data and not progress.checkpoint_passed:
        return {"ok": True, "checkpoint": progress.checkpoint_data, "cached": True}

    # Choose source: reteaching content takes priority after a failed attempt
    source_lesson = progress.reteaching_content or progress.lesson_content
    source_label = "reteaching lesson" if progress.reteaching_content else "original lesson"

    result = await ai_service.generate_checkpoint(
        lesson=source_lesson,
        concept_name=concept.name,
        subject_name=subject.name,
        topic_name=topic.name,
        source_label=source_label,
    )
    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"]["message"])

    checkpoint = result["checkpoint"]
    checkpoint["generatedAt"] = _now().isoformat()
    checkpoint["basedOnLesson"] = True
    checkpoint["sourceLessonType"] = source_label
    checkpoint["aiProvider"] = result["provider"]

    # PERSIST checkpoint so page refresh works
    progress.checkpoint_data = checkpoint
    progress.updated_at = _now()
    await db.commit()
    await db.refresh(progress)

    logger.info("Checkpoint generated: concept=%d user=%d source=%s", concept_id, current_user.id, source_label)
    return {"ok": True, "checkpoint": checkpoint, "cached": False}


# ─── 5. POST /concepts/{id}/submit-checkpoint ────────────────────────────────

@router.post("/{concept_id}/submit-checkpoint")
async def submit_checkpoint(
    concept_id: int,
    body: SubmitCheckpointRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Evaluate checkpoint answers against the persisted checkpoint_data.
    Pass (≥67%) → advance to 'explain'. Fail → increment reteaching_count.
    """
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "submitting checkpoint answers")

    # Use persisted checkpoint_data — do not trust client-submitted questions
    checkpoint = progress.checkpoint_data
    if not checkpoint:
        raise HTTPException(
            status_code=400,
            detail="No checkpoint found. Generate a checkpoint first.",
        )

    questions = checkpoint.get("questions", [])
    passing_score = checkpoint.get("passingScore", 67)

    if not questions:
        raise HTTPException(status_code=400, detail="Checkpoint has no questions.")

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
            "correctAnswerText": q.get("options", {}).get(correct_ans, correct_ans),
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
        "missedKeyPoints": list(dict.fromkeys(missed_key_points)),
        "checkpointMeta": {
            "sourceLessonType": checkpoint.get("sourceLessonType", "original"),
            "passingScore": passing_score,
        },
    }
    progress.checkpoint_attempts = list(progress.checkpoint_attempts or []) + [attempt_record]

    if passed:
        progress.checkpoint_passed = True
        progress.checkpoint_passed_at = _now()
        # Clear reteaching + checkpoint_data so the next reteach cycle gets fresh questions
        progress.reteaching_content = None
        progress.checkpoint_data = None
        progress.current_stage = "explain"
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        logger.info("Checkpoint passed: concept=%d user=%d score=%d", concept_id, current_user.id, score)
        return {
            "ok": True, "passed": True, "score": score,
            "results": results,
            "message": "Checkpoint passed! Explain It unlocked.",
            "progress": progress.serialize(),
        }
    else:
        progress.reteaching_count = (progress.reteaching_count or 0) + 1
        # Clear cached checkpoint so new reteaching generates fresh questions
        progress.checkpoint_data = None
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        logger.info("Checkpoint failed: concept=%d user=%d score=%d", concept_id, current_user.id, score)
        return {
            "ok": True, "passed": False, "score": score,
            "results": results,
            "message": f"Score {score}% — need {passing_score}% to pass.",
            "needsReteaching": True,
            "missedKeyPoints": list(dict.fromkeys(missed_key_points)),
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
    """Generate a focused reteaching lesson for the points the student missed.
    Saved reteaching_content becomes the source for the NEXT checkpoint.
    """
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "checkpoint", "generating reteaching")

    if not progress.lesson_content:
        raise HTTPException(status_code=400, detail="No original lesson found.")
    if not progress.checkpoint_attempts:
        raise HTTPException(status_code=400, detail="No checkpoint attempt found to reteach from.")

    # Build curriculum context with reteach-specific fields
    ctx = await _build_curriculum_context(db, concept, topic, subject)
    ctx["is_reteach"] = True
    ctx["missed_points"] = body.missedKeyPoints
    ctx["previous_lesson"] = progress.lesson_content

    result = await ai_service.generate_reteaching(ctx)
    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"]["message"])

    reteaching = result["lesson"]
    reteaching["generatedAt"] = _now().isoformat()
    reteaching["isReteaching"] = True
    reteaching["attemptNumber"] = progress.reteaching_count
    reteaching["aiProvider"] = result["provider"]

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
    """Submit student explanation; AI evaluates conceptual understanding."""
    concept, topic, subject = await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    _require_current_stage(progress, "explain", "submitting an explanation")

    if not progress.checkpoint_passed:
        raise HTTPException(status_code=403, detail="Must pass checkpoint first.")

    if not body.explanation or len(body.explanation.strip()) < 20:
        raise HTTPException(status_code=400, detail="Explanation is too short.")

    # Load misconceptions and objectives for AI context
    misc_result = await db.execute(
        select(Misconception).where(
            (Misconception.concept_id == concept_id) |
            ((Misconception.concept_id.is_(None)) & (Misconception.topic_id == topic.id))
        )
    )
    misconceptions = misc_result.scalars().all()

    obj_result = await db.execute(
        select(LearningObjective)
        .where(LearningObjective.topic_id == topic.id)
        .order_by(LearningObjective.order_index)
    )
    objectives = obj_result.scalars().all()

    concepts_ctx = [{"name": concept.name, "explanation": concept.explanation, "keyPoints": concept.key_points or []}]
    misc_ctx = [{"misconception": m.misconception, "correction": m.correction} for m in misconceptions]
    obj_ctx = [{"title": o.title, "description": o.description} for o in objectives]
    prev_attempts = [{"response": a.get("explanation", "")} for a in (progress.explanation_attempts or [])]

    ai_result = await ai_service.verify_explanation(
        student_response=body.explanation,
        topic_name=topic.name,
        subject_name=subject.name,
        activity_prompt="Explain this concept in your own words",
        concepts=concepts_ctx,
        misconceptions=misc_ctx,
        learning_objectives=obj_ctx,
        previous_attempts=prev_attempts,
    )

    # AI unavailable path — save as pending
    if not ai_result.get("success"):
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
            "message": (
                "AI verification is temporarily unavailable. "
                "Your response has been saved. You can try again or continue."
            ),
        }

    attempt_record = {
        "timestamp": _now().isoformat(),
        "explanation": body.explanation,
        "aiResult": ai_result,
    }
    progress.explanation_attempts = list(progress.explanation_attempts or []) + [attempt_record]

    result_data = ai_result.get("result", {})
    verdict = result_data.get("verdict", "incorrect")
    demonstrated = result_data.get("demonstrated_understanding", False)
    # Pass if verdict is "correct" or "partial" with demonstrated understanding
    passed = (verdict == "correct" and demonstrated) or (verdict == "partial" and demonstrated)

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
        logger.info("Explanation verified: concept=%d user=%d verdict=%s", concept_id, current_user.id, verdict)
        return {
            "ok": True, "passed": True,
            "verdict": verdict,
            "aiResult": result_data,
            "message": "Great explanation! You're now eligible for the Challenge.",
            "progress": progress.serialize(),
        }
    else:
        progress.ai_verification_result = result_data
        progress.updated_at = _now()
        await db.commit()
        await db.refresh(progress)
        return {
            "ok": True, "passed": False,
            "verdict": verdict,
            "aiResult": result_data,
            "shouldRetry": result_data.get("should_retry", True),
            "message": "Your explanation needs more detail. Review the feedback and try again.",
            "progress": progress.serialize(),
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

    ctx = {
        "concept_name": concept.name,
        "subject_name": subject.name,
        "topic_name": topic.name,
        "concept_explanation": concept.explanation,
        "key_points": list(concept.key_points or []),
        "lesson_content": progress.lesson_content,
    }

    result = await ai_service.ask_concept_question(body.question.strip(), ctx)

    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"]["message"])

    qa_entry = {
        "timestamp": _now().isoformat(),
        "question": body.question,
        "answer": result["answer"],
    }
    progress.ask_ai_questions = list(progress.ask_ai_questions or []) + [qa_entry]
    progress.updated_at = _now()
    await db.commit()

    return {"ok": True, "answer": result["answer"], "question": body.question}


# ─── 9. POST /concepts/{id}/verify-concept ───────────────────────────────────

@router.post("/{concept_id}/verify-concept")
async def verify_concept(
    concept_id: int,
    body: VerifyConceptRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark concept VERIFIED after a successful Challenge. Unlocks next concept."""
    await _get_concept_context(db, concept_id)
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
    """Called when a student fails a Challenge.
    Resets back to checkpoint stage. Does NOT permanently block the student.
    """
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)

    if not progress.challenge_eligible:
        raise HTTPException(status_code=403, detail="No active challenge found.")

    # Reset to checkpoint for the full reteach → checkpoint → explain → challenge cycle
    progress.checkpoint_passed = False
    progress.checkpoint_passed_at = None
    progress.checkpoint_data = None
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
    """Return full learning history for a concept."""
    await _get_concept_context(db, concept_id)
    progress = await _get_or_create_progress(db, current_user.id, concept_id)
    return {"ok": True, "progress": progress.serialize()}


# ─── 12. GET /topic/{topic_id}/concepts ──────────────────────────────────────

@router.get("/topic/{topic_id}/concepts")
async def list_topic_concepts(
    topic_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return all concepts in a topic with lock/progress state per user."""
    topic_result = await db.execute(
        select(Topic, Subject)
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Topic.id == topic_id)
    )
    topic_row = topic_result.one_or_none()
    if not topic_row:
        raise HTTPException(status_code=404, detail="Topic not found.")
    topic, subject = topic_row

    concepts_result = await db.execute(
        select(Concept).where(Concept.topic_id == topic_id).order_by(Concept.id)
    )
    concepts = concepts_result.scalars().all()

    # Fetch all progress records for this user in this topic
    concept_ids = [c.id for c in concepts]
    progress_result = await db.execute(
        select(ConceptProgress)
        .where(ConceptProgress.user_id == current_user.id)
        .where(ConceptProgress.concept_id.in_(concept_ids))
    )
    progress_map = {p.concept_id: p for p in progress_result.scalars().all()}

    result = []
    for i, concept in enumerate(concepts):
        prog = progress_map.get(concept.id)
        is_locked = i > 0 and not (
            progress_map.get(concepts[i - 1].id) and
            progress_map[concepts[i - 1].id].verified
        )
        result.append({
            "concept": concept.serialize(),
            "progress": prog.serialize() if prog else None,
            "isLocked": is_locked,
            "isVerified": bool(prog and prog.verified),
            "inProgress": bool(prog and not prog.verified and prog.lesson_completed),
        })

    return {
        "ok": True,
        "topic": topic.serialize(),
        "subject": subject.serialize(),
        "concepts": result,
    }
