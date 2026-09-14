"""Learning Session API — peer-to-peer guided learning sessions.

Route prefix (mounted in main.py): /api/learning

All endpoints require an authenticated user.
Session data is only accessible to the creator or partner.
"""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import current_user
from app.models.curriculum import (
    Concept, LearningActivity, LearningObjective, LearningSession,
    Misconception, Question, Resource, SessionActivityResult,
    Subject, Topic, TopicProgress,
)
from app.models.match import MatchRequest
from app.models.user import User
from app.schemas.base import StrictModel
from app.services import progress_service
from app.services.ai_service import verify_explanation

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_user_brief(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.full_name or user.email,
        "photoUrl": user.photo_url or "",
    }


def _serialize_topic_brief(topic: Topic, subject: Optional[Subject] = None) -> dict:
    return {
        "id": topic.id,
        "name": topic.name,
        "slug": topic.slug,
        "description": topic.description,
        "difficulty": topic.difficulty,
        "subject": subject.name if subject else None,
        "subjectIcon": subject.icon if subject else None,
    }


def _estimate_duration(activity_count: int) -> int:
    """Return estimated session duration in minutes (7 min per activity, min 15)."""
    return max(15, activity_count * 7)


async def _assert_participant(session_obj: LearningSession, user_id: int) -> None:
    if session_obj.creator_id != user_id and session_obj.partner_id != user_id:
        raise HTTPException(403, "You are not a participant in this session.")


async def _are_connected(db: AsyncSession, user_a: int, user_b: int) -> bool:
    """Return True if the two users have an accepted MatchRequest between them."""
    row = (await db.execute(
        select(MatchRequest).where(
            MatchRequest.status == "accepted",
            or_(
                (MatchRequest.sender_id == user_a) & (MatchRequest.receiver_id == user_b),
                (MatchRequest.sender_id == user_b) & (MatchRequest.receiver_id == user_a),
            ),
        )
    )).scalar_one_or_none()
    return row is not None


async def _generate_code(db: AsyncSession, topic_name: str) -> str:
    """Generate a unique session code like NLM-4827. Retries up to 10 times."""
    prefix = "".join(c for c in topic_name if c.isalpha())[:3].upper()
    if len(prefix) < 3:
        prefix = prefix.ljust(3, "X")
    for _ in range(10):
        digits = "".join(random.choices(string.digits, k=4))
        code = f"{prefix}-{digits}"
        exists = (await db.execute(
            select(LearningSession).where(LearningSession.session_code == code)
        )).scalar_one_or_none()
        if exists is None:
            return code
    # Fallback: fully random 3-letter prefix
    prefix = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=4))
    return f"{prefix}-{digits}"


async def _load_topic_full(db: AsyncSession, topic_id: int) -> Topic:
    """Load topic with all curriculum relations eager-loaded."""
    stmt = (
        select(Topic)
        .where(Topic.id == topic_id)
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.learning_objectives),
            selectinload(Topic.concepts),
            selectinload(Topic.misconceptions),
            selectinload(Topic.learning_activities),
            selectinload(Topic.questions),
            selectinload(Topic.resources),
        )
    )
    t = (await db.execute(stmt)).scalar_one_or_none()
    if t is None:
        raise HTTPException(404, "Topic not found.")
    return t


def _serialize_full_topic(topic: Topic) -> dict:
    return {
        **_serialize_topic_brief(topic, topic.subject),
        "objectives": [o.serialize() for o in topic.learning_objectives],
        "concepts": [c.serialize() for c in topic.concepts],
        "misconceptions": [m.serialize() for m in topic.misconceptions],
        "activities": [a.serialize() for a in topic.learning_activities],
        "questions": [q.serialize() for q in topic.questions],
        "resources": [r.serialize() for r in topic.resources],
    }


def _serialize_session_full(
    sess: LearningSession,
    topic: Optional[Topic] = None,
    creator: Optional[User] = None,
    partner: Optional[User] = None,
) -> dict:
    data = sess.serialize()
    if topic:
        data["topic"] = _serialize_full_topic(topic)
    if creator:
        data["creator"] = _serialize_user_brief(creator)
    if partner:
        data["partner"] = _serialize_user_brief(partner)
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateSessionRequest(StrictModel):
    topicId: int


class AdvanceStageRequest(StrictModel):
    stage: str = Field(pattern=r"^(learn|explain|practice|challenge|check|completed)$")


class SubmitActivityRequest(BaseModel):
    response: str = Field(min_length=1)
    questionId: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# 1. GET /learning/topics — list available topics with metadata counts
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/topics")
async def list_learning_topics(
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    stmt = (
        select(Topic)
        .where(Topic.is_active == True)  # noqa: E712
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.learning_objectives),
            selectinload(Topic.concepts),
            selectinload(Topic.learning_activities),
            selectinload(Topic.questions),
            selectinload(Topic.resources),
            selectinload(Topic.misconceptions),
        )
        .order_by(Topic.name)
    )
    topics = (await db.execute(stmt)).scalars().all()
    result = []
    for t in topics:
        acts = t.learning_activities or []
        result.append({
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "description": t.description,
            "difficulty": t.difficulty,
            "subject": t.subject.name if t.subject else None,
            "subjectIcon": t.subject.icon if t.subject else None,
            "objectivesCount": len(t.learning_objectives),
            "conceptsCount": len(t.concepts),
            "misconceptionsCount": len(t.misconceptions),
            "activitiesCount": len(acts),
            "questionsCount": len(t.questions),
            "resourcesCount": len(t.resources),
            "estimatedMinutes": _estimate_duration(len(acts)),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 2. POST /learning/sessions — create a new session
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions", status_code=201)
async def create_learning_session(
    body: CreateSessionRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    # Verify the topic exists and is active
    topic = (await db.execute(
        select(Topic).where(Topic.id == body.topicId, Topic.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(404, "Topic not found or not available.")

    code = await _generate_code(db, topic.name)
    expires = _now() + timedelta(hours=24)

    sess = LearningSession(
        creator_id=user.id,
        partner_id=None,
        topic_id=body.topicId,
        goal=f"Learn {topic.name}",
        status="pending",
        current_stage="learn",
        session_code=code,
        expires_at=expires,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)

    # Load subject for response
    subj = (await db.execute(select(Subject).where(Subject.id == topic.subject_id))).scalar_one_or_none()
    return {
        **sess.serialize(),
        "topic": _serialize_topic_brief(topic, subj),
        "creator": _serialize_user_brief(user),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. GET /learning/sessions/join/{code} — validate a code
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/join/{code}")
async def validate_session_code(
    code: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.session_code == code.upper())
    )).scalar_one_or_none()

    if sess is None:
        raise HTTPException(404, "No active session found for that code. Please check and try again.")
    if sess.status != "pending":
        raise HTTPException(404, "This session is no longer accepting new participants.")
    if sess.expires_at and sess.expires_at < _now():
        raise HTTPException(404, "This session code has expired.")
    if sess.creator_id == user.id:
        raise HTTPException(400, "You cannot join your own session. Share this code with a study partner.")

    # Verify the joiner is a connected peer of the creator
    connected = await _are_connected(db, user.id, sess.creator_id)
    if not connected:
        raise HTTPException(403, "You must be a connected peer of the session creator to join.")

    # Load full topic and creator info
    topic = await _load_topic_full(db, sess.topic_id)
    creator = (await db.execute(select(User).where(User.id == sess.creator_id))).scalar_one_or_none()

    acts = topic.learning_activities or []
    return {
        **sess.serialize(),
        "topic": {
            **_serialize_topic_brief(topic, topic.subject),
            "objectivesCount": len(topic.learning_objectives),
            "conceptsCount": len(topic.concepts),
            "misconceptionsCount": len(topic.misconceptions),
            "activitiesCount": len(acts),
            "questionsCount": len(topic.questions),
            "resourcesCount": len(topic.resources),
            "estimatedMinutes": _estimate_duration(len(acts)),
        },
        "creator": _serialize_user_brief(creator) if creator else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. POST /learning/sessions/{sessionId}/join — partner officially joins
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/join")
async def join_learning_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    if sess.status != "pending":
        raise HTTPException(400, "This session is no longer accepting participants.")
    if sess.expires_at and sess.expires_at < _now():
        raise HTTPException(400, "This session has expired.")
    if sess.creator_id == user.id:
        raise HTTPException(400, "You cannot join your own session.")

    connected = await _are_connected(db, user.id, sess.creator_id)
    if not connected:
        raise HTTPException(403, "You must be a connected peer of the session creator to join.")

    sess.partner_id = user.id
    sess.status = "active"
    sess.started_at = _now()
    await db.commit()
    await db.refresh(sess)

    topic = await _load_topic_full(db, sess.topic_id)
    creator = (await db.execute(select(User).where(User.id == sess.creator_id))).scalar_one_or_none()

    return _serialize_session_full(sess, topic, creator, user)


# ─────────────────────────────────────────────────────────────────────────────
# 5. GET /learning/sessions/{sessionId} — full session data
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}")
async def get_learning_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    topic = await _load_topic_full(db, sess.topic_id)
    creator = (await db.execute(select(User).where(User.id == sess.creator_id))).scalar_one_or_none()
    partner = None
    if sess.partner_id:
        partner = (await db.execute(select(User).where(User.id == sess.partner_id))).scalar_one_or_none()

    return _serialize_session_full(sess, topic, creator, partner)


# ─────────────────────────────────────────────────────────────────────────────
# 6. PATCH /learning/sessions/{sessionId}/stage — advance stage
# ─────────────────────────────────────────────────────────────────────────────

@router.patch("/learning/sessions/{session_id}/stage")
async def advance_stage(
    session_id: int,
    body: AdvanceStageRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)
    if sess.status not in ("active", "pending"):
        raise HTTPException(400, "Cannot advance stage of a completed or cancelled session.")

    sess.current_stage = body.stage
    await db.commit()
    await db.refresh(sess)
    return sess.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 7. POST /learning/sessions/{sessionId}/activities/{activityId}/submit
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/activities/{activity_id}/submit")
async def submit_activity(
    session_id: int,
    activity_id: int,
    body: SubmitActivityRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    # Load activity and verify it belongs to this session's topic
    activity = (await db.execute(
        select(LearningActivity).where(
            LearningActivity.id == activity_id,
            LearningActivity.topic_id == sess.topic_id,
        )
    )).scalar_one_or_none()
    if activity is None:
        raise HTTPException(404, "Activity not found for this session's topic.")

    # Count existing attempts for this user/activity in this session
    existing_attempts = (await db.execute(
        select(SessionActivityResult).where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.user_id == user.id,
            SessionActivityResult.activity_id == activity_id,
        )
    )).scalars().all()
    attempt_number = len(existing_attempts) + 1

    ai_feedback: Optional[str] = None
    hint: Optional[str] = None
    is_correct: Optional[bool] = None
    score: Optional[int] = None
    misconception_detected: Optional[str] = None

    # For "explain" activities: call AI verification
    if activity.type == "explain":
        topic = await _load_topic_full(db, sess.topic_id)
        concepts_data = [
            {
                "name": c.name,
                "explanation": c.explanation,
                "key_points": c.key_points or [],
            }
            for c in topic.concepts
        ]
        misconceptions_data = [
            {
                "misconception": m.misconception,
                "correction": m.correction,
                "hint": m.hint,
            }
            for m in topic.misconceptions
        ]
        ai_result = await verify_explanation(
            student_response=body.response,
            topic_name=topic.name,
            activity_prompt=activity.prompt or activity.title,
            concepts=concepts_data,
            misconceptions=misconceptions_data,
        )
        is_correct = ai_result.get("is_correct", False)
        score = int((ai_result.get("score", 0.0) * 100))
        ai_feedback = ai_result.get("feedback")
        hint = ai_result.get("hint")
        misconception_detected = ai_result.get("misconception_detected")

    # For question-based activities: check answer
    elif body.questionId is not None:
        question = (await db.execute(
            select(Question).where(
                Question.id == body.questionId,
                Question.topic_id == sess.topic_id,
            )
        )).scalar_one_or_none()
        if question and question.answer:
            correct_answer = question.answer.strip().lower()
            given_answer = body.response.strip().lower()
            is_correct = (given_answer == correct_answer)
            score = 100 if is_correct else 0
            hint = question.hint if not is_correct else None
            ai_feedback = question.explanation if not is_correct else None

    # Save the result
    result = SessionActivityResult(
        session_id=session_id,
        user_id=user.id,
        activity_id=activity_id,
        response=body.response,
        is_correct=is_correct,
        ai_feedback=ai_feedback,
        hint=hint,
        retry=(attempt_number > 1),
        attempt_number=attempt_number,
        score=score,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    return {
        **result.serialize(),
        "misconceptionDetected": misconception_detected,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. POST /learning/sessions/{sessionId}/complete — finish the session
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/complete")
async def complete_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)
    if sess.status == "completed":
        return sess.serialize()

    sess.status = "completed"
    sess.completed_at = _now()
    sess.current_stage = "completed"
    await db.commit()
    await db.refresh(sess)

    # Calculate scores from results for both participants
    participants = [p for p in [sess.creator_id, sess.partner_id] if p is not None]
    xp_awarded = 75  # base XP per session

    for uid in participants:
        # Load all results for this user in this session
        results = (await db.execute(
            select(SessionActivityResult).where(
                SessionActivityResult.session_id == session_id,
                SessionActivityResult.user_id == uid,
            )
        )).scalars().all()

        # Calculate understanding_score from explain results
        explain_results = [r for r in results if r.score is not None]
        understanding_score: Optional[int] = None
        if explain_results:
            understanding_score = int(sum(r.score for r in explain_results) / len(explain_results))

        # Calculate practice_score from non-explain correct answers
        practice_results = [r for r in results if r.is_correct is not None]
        practice_score: Optional[int] = None
        if practice_results:
            correct = sum(1 for r in practice_results if r.is_correct)
            practice_score = int((correct / len(practice_results)) * 100)

        # Upsert TopicProgress
        progress = (await db.execute(
            select(TopicProgress).where(
                TopicProgress.user_id == uid,
                TopicProgress.topic_id == sess.topic_id,
            )
        )).scalar_one_or_none()

        if progress is None:
            progress = TopicProgress(
                user_id=uid,
                topic_id=sess.topic_id,
                understanding_score=understanding_score,
                practice_score=practice_score,
                sessions_completed=1,
                last_studied_at=_now(),
            )
            db.add(progress)
        else:
            if understanding_score is not None:
                progress.understanding_score = understanding_score
            if practice_score is not None:
                progress.practice_score = practice_score
            progress.sessions_completed = (progress.sessions_completed or 0) + 1
            progress.last_studied_at = _now()
            if understanding_score is not None and understanding_score < 60:
                progress.needs_review = True

        # Award XP
        u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
        if u:
            u.xp = (u.xp or 0) + xp_awarded
            u.session_count = (u.session_count or 0) + 1

        await db.commit()

        # Record activity for streak + badges
        await progress_service.record_activity(db, uid)
        await progress_service.evaluate_badges(db, uid)

    return {
        **sess.serialize(),
        "xpAwarded": xp_awarded,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9. GET /learning/sessions/{sessionId}/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}/summary")
async def get_session_summary(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    topic = await _load_topic_full(db, sess.topic_id)

    # Load this user's results
    results = (await db.execute(
        select(SessionActivityResult).where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.user_id == user.id,
        )
    )).scalars().all()

    # Activities completed (unique activity IDs)
    activities_completed = len({r.activity_id for r in results})
    total_activities = len(topic.learning_activities)

    # Questions answered correctly
    question_results = [r for r in results if r.is_correct is not None]
    questions_correct = sum(1 for r in question_results if r.is_correct)
    total_questions = len(question_results)

    # Understanding score from explain activities
    explain_results = [r for r in results if r.score is not None]
    understanding_score: Optional[int] = None
    if explain_results:
        understanding_score = int(sum(r.score for r in explain_results) / len(explain_results))

    # AI feedback highlights
    feedback_items = [r.ai_feedback for r in results if r.ai_feedback and r.is_correct]
    hints_given = [r.hint for r in results if r.hint and not r.is_correct]

    # XP (fixed 75 per session)
    xp_earned = 75

    return {
        "sessionId": session_id,
        "topicName": topic.name,
        "subject": topic.subject.name if topic.subject else None,
        "subjectIcon": topic.subject.icon if topic.subject else None,
        "activitiesCompleted": activities_completed,
        "totalActivities": total_activities,
        "questionsAnswered": total_questions,
        "questionsCorrect": questions_correct,
        "xpEarned": xp_earned,
        "understandingScore": understanding_score,
        "feedbackHighlights": feedback_items[:3],
        "hintsGiven": hints_given[:3],
        "status": sess.status,
        "startedAt": sess.started_at.isoformat() if sess.started_at else None,
        "completedAt": sess.completed_at.isoformat() if sess.completed_at else None,
    }
