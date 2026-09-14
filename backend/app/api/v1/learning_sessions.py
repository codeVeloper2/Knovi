"""Peer Teaching Learning Session API.

Route prefix mounted in main.py: /api
All routes: /api/learning/...

Roles:
  teacher_id  — the student who is good at the subject (explains concepts)
  learner_id  — the student who needs help (asks questions, explains back)

Phases: setup → concepts → practice → challenge → summary
"""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import current_user
from app.models.curriculum import (
    Concept, LearningActivity, LearningObjective,
    LearningSession, Misconception, Question, Resource,
    SessionActivityResult, Subject, Topic, TopicProgress,
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


def _user_brief(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.full_name or u.email,
        "photoUrl": u.photo_url or "",
        "grade": u.grade or "",
    }


def _estimate_duration(concept_count: int, question_count: int) -> int:
    return max(20, concept_count * 8 + question_count * 3)


async def _assert_participant(sess: LearningSession, user_id: int) -> None:
    if sess.teacher_id != user_id and sess.learner_id != user_id and \
       sess.creator_id != user_id and sess.partner_id != user_id:
        raise HTTPException(403, "You are not a participant in this session.")


async def _get_connection(db: AsyncSession, user_a: int, user_b: int) -> Optional[MatchRequest]:
    """Return the accepted MatchRequest between two users, or None."""
    return (await db.execute(
        select(MatchRequest).where(
            MatchRequest.status == "accepted",
            or_(
                and_(MatchRequest.sender_id == user_a, MatchRequest.receiver_id == user_b),
                and_(MatchRequest.sender_id == user_b, MatchRequest.receiver_id == user_a),
            ),
        )
    )).scalar_one_or_none()


async def _generate_code(db: AsyncSession, topic_name: str) -> str:
    prefix = "".join(c for c in topic_name if c.isalpha())[:3].upper().ljust(3, "X")
    for _ in range(10):
        code = f"{prefix}-{''.join(random.choices(string.digits, k=4))}"
        exists = (await db.execute(
            select(LearningSession).where(LearningSession.session_code == code)
        )).scalar_one_or_none()
        if exists is None:
            return code
    return f"{''.join(random.choices(string.ascii_uppercase, k=3))}-{''.join(random.choices(string.digits, k=4))}"


async def _load_topic_full(db: AsyncSession, topic_id: int) -> Topic:
    t = (await db.execute(
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
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(404, "Topic not found.")
    return t


def _serialize_topic_full(t: Topic) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "description": t.description,
        "difficulty": t.difficulty,
        "subject": t.subject.name if t.subject else None,
        "subjectIcon": t.subject.icon if t.subject else None,
        "objectives": [o.serialize() for o in t.learning_objectives],
        "concepts": sorted([c.serialize() for c in t.concepts], key=lambda x: x["id"]),
        "misconceptions": [m.serialize() for m in t.misconceptions],
        "activities": sorted([a.serialize() for a in t.learning_activities], key=lambda x: x["orderIndex"]),
        "questions": [q.serialize() for q in t.questions],
        "resources": [r.serialize() for r in t.resources],
    }


def _full_session(
    sess: LearningSession,
    topic: Optional[Topic] = None,
    teacher: Optional[User] = None,
    learner: Optional[User] = None,
    results: Optional[list] = None,
) -> dict:
    data = sess.serialize()
    if topic:
        data["topic"] = _serialize_topic_full(topic)
    if teacher:
        data["teacher"] = _user_brief(teacher)
    if learner:
        data["learner"] = _user_brief(learner)
    if results is not None:
        data["results"] = [r.serialize() for r in results]
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateSessionRequest(StrictModel):
    topicId:   int
    partnerId: int


class JoinSessionRequest(BaseModel):
    pass  # no body needed


class ExplanationRequest(BaseModel):
    response:      str = Field(min_length=1)
    attemptNumber: int = Field(default=1, ge=1)


class VerdictRequest(BaseModel):
    verdict:       str = Field(pattern=r"^(approved|retry)$")
    teacherComment: str = Field(default="")


class PracticeAnswerRequest(BaseModel):
    response: str = Field(min_length=1)


class ChallengeRequest(BaseModel):
    response: str = Field(min_length=1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. GET /api/learning/topics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/topics")
async def list_learning_topics(
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    topics = (await db.execute(
        select(Topic)
        .where(Topic.is_active == True)  # noqa: E712
        .options(
            selectinload(Topic.subject),
            selectinload(Topic.learning_objectives),
            selectinload(Topic.concepts),
            selectinload(Topic.misconceptions),
            selectinload(Topic.learning_activities),
            selectinload(Topic.questions),
            selectinload(Topic.resources),
        )
        .order_by(Topic.name)
    )).scalars().all()

    result = []
    for t in topics:
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
            "activitiesCount": len(t.learning_activities),
            "questionsCount": len(t.questions),
            "resourcesCount": len(t.resources),
            "estimatedMinutes": _estimate_duration(len(t.concepts), len(t.questions)),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 2. POST /api/learning/sessions
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions", status_code=201)
async def create_session(
    body: CreateSessionRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    # Verify topic — eager-load subject to avoid lazy-load after commit
    topic = (await db.execute(
        select(Topic)
        .where(Topic.id == body.topicId, Topic.is_active == True)  # noqa: E712
        .options(selectinload(Topic.subject))
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(404, "Topic not found or not available.")

    # Verify partner exists and is connected
    partner = (await db.execute(select(User).where(User.id == body.partnerId))).scalar_one_or_none()
    if partner is None:
        raise HTTPException(404, "Partner not found.")
    if partner.id == user.id:
        raise HTTPException(400, "You cannot create a session with yourself.")

    connection = await _get_connection(db, user.id, partner.id)
    if connection is None:
        raise HTTPException(403, "You must be connected with this student to create a session.")

    # Determine roles: sender of the match request = learner, receiver = teacher
    if connection.sender_id == user.id:
        # current user sent the request → current user is the learner
        teacher_id = partner.id
        learner_id = user.id
    else:
        # current user received the request → current user is the teacher
        teacher_id = user.id
        learner_id = partner.id

    code = await _generate_code(db, topic.name)
    expires = _now() + timedelta(hours=24)

    sess = LearningSession(
        creator_id=user.id,
        partner_id=partner.id,
        teacher_id=teacher_id,
        learner_id=learner_id,
        topic_id=body.topicId,
        goal=f"Peer teaching: {topic.name}",
        status="pending",
        phase="setup",
        current_stage="learn",
        current_concept_idx=0,
        session_code=code,
        expires_at=expires,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)

    teacher_user = (await db.execute(select(User).where(User.id == teacher_id))).scalar_one()
    learner_user = (await db.execute(select(User).where(User.id == learner_id))).scalar_one()

    return {
        **sess.serialize(),
        "topic": {"id": topic.id, "name": topic.name,
                  "subject": topic.subject.name if topic.subject else None},
        "teacher": _user_brief(teacher_user),
        "learner": _user_brief(learner_user),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. GET /api/learning/sessions/join/{code}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/join/{code}")
async def validate_code(
    code: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.session_code == code.upper())
    )).scalar_one_or_none()

    if sess is None:
        raise HTTPException(404, "No session found for that code. Please check and try again.")
    if sess.status not in ("pending", "active"):
        raise HTTPException(404, "This session is no longer available.")
    if sess.expires_at and sess.expires_at < _now():
        raise HTTPException(404, "This session code has expired.")
    if user.id not in (sess.creator_id, sess.partner_id, sess.teacher_id, sess.learner_id):
        raise HTTPException(403, "You are not invited to this session.")

    topic = await _load_topic_full(db, sess.topic_id)
    teacher = (await db.execute(select(User).where(User.id == sess.teacher_id))).scalar_one_or_none()
    learner = (await db.execute(select(User).where(User.id == sess.learner_id))).scalar_one_or_none()

    acts = topic.learning_activities or []
    return {
        **sess.serialize(),
        "topic": {
            "id": topic.id, "name": topic.name,
            "subject": topic.subject.name if topic.subject else None,
            "subjectIcon": topic.subject.icon if topic.subject else None,
            "objectivesCount": len(topic.learning_objectives),
            "conceptsCount": len(topic.concepts),
            "misconceptionsCount": len(topic.misconceptions),
            "activitiesCount": len(acts),
            "questionsCount": len(topic.questions),
            "resourcesCount": len(topic.resources),
            "estimatedMinutes": _estimate_duration(len(topic.concepts), len(topic.questions)),
        },
        "teacher": _user_brief(teacher) if teacher else None,
        "learner": _user_brief(learner) if learner else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. POST /api/learning/sessions/{sessionId}/join
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/join")
async def join_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    if user.id not in (sess.creator_id, sess.partner_id, sess.teacher_id, sess.learner_id):
        raise HTTPException(403, "You are not invited to this session.")
    if sess.expires_at and sess.expires_at < _now():
        raise HTTPException(400, "This session has expired.")

    if sess.status == "pending":
        sess.status = "active"
        sess.phase = "setup"
        sess.started_at = _now()
        await db.commit()
        await db.refresh(sess)

    topic = await _load_topic_full(db, sess.topic_id)
    teacher = (await db.execute(select(User).where(User.id == sess.teacher_id))).scalar_one_or_none()
    learner = (await db.execute(select(User).where(User.id == sess.learner_id))).scalar_one_or_none()
    results = (await db.execute(
        select(SessionActivityResult).where(SessionActivityResult.session_id == session_id)
    )).scalars().all()
    return _full_session(sess, topic, teacher, learner, list(results))


# ─────────────────────────────────────────────────────────────────────────────
# 5. GET /api/learning/sessions/{sessionId}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}")
async def get_session(
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
    teacher = (await db.execute(select(User).where(User.id == sess.teacher_id))).scalar_one_or_none() if sess.teacher_id else None
    learner = (await db.execute(select(User).where(User.id == sess.learner_id))).scalar_one_or_none() if sess.learner_id else None
    results = (await db.execute(
        select(SessionActivityResult).where(SessionActivityResult.session_id == session_id)
    )).scalars().all()
    return _full_session(sess, topic, teacher, learner, list(results))


# ─────────────────────────────────────────────────────────────────────────────
# 6. POST /api/learning/sessions/{sessionId}/ready
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/ready")
async def mark_ready(
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

    if user.id == sess.teacher_id:
        sess.teacher_ready = True
    elif user.id == sess.learner_id:
        sess.learner_ready = True

    # Both ready → advance to concepts phase
    if sess.teacher_ready and sess.learner_ready:
        sess.phase = "concepts"

    await db.commit()
    await db.refresh(sess)
    return sess.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 7. POST /api/learning/sessions/{sessionId}/concepts/{conceptId}/explanation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/explanation")
async def submit_explanation(
    session_id: int,
    concept_id: int,
    body: ExplanationRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    # Only the learner can submit explanations
    if user.id != sess.learner_id:
        raise HTTPException(403, "Only the learner submits explanations.")

    # Load concept
    concept = (await db.execute(
        select(Concept).where(Concept.id == concept_id, Concept.topic_id == sess.topic_id)
    )).scalar_one_or_none()
    if concept is None:
        raise HTTPException(404, "Concept not found for this session.")

    # Load topic for AI context
    topic = await _load_topic_full(db, sess.topic_id)
    subject_name = topic.subject.name if topic.subject else ""

    # Related misconceptions for this concept
    related_misconceptions = [
        m.serialize() for m in topic.misconceptions
        if m.concept_id == concept_id or m.concept_id is None
    ]

    # Previous attempts for this concept in this session
    prev_results = (await db.execute(
        select(SessionActivityResult).where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.user_id == user.id,
            SessionActivityResult.concept_id == concept_id,
        )
    )).scalars().all()
    previous_attempts = [{"response": r.response} for r in prev_results]

    # Need a dummy activity_id — use first explain activity or 0
    explain_activity = next(
        (a for a in topic.learning_activities if a.type == "explain"), None
    )
    # Fallback: create result without activity if no explain activity
    activity_id = explain_activity.id if explain_activity else (
        topic.learning_activities[0].id if topic.learning_activities else None
    )
    if activity_id is None:
        raise HTTPException(400, "No activities configured for this topic yet.")

    # Call AI
    ai_result = await verify_explanation(
        student_response=body.response,
        topic_name=topic.name,
        subject_name=subject_name,
        activity_prompt=f"Explain the concept: {concept.name}",
        concepts=[concept.serialize()],
        misconceptions=related_misconceptions,
        learning_objectives=[o.serialize() for o in topic.learning_objectives],
        previous_attempts=previous_attempts,
    )

    ai_verdict = None
    ai_confidence = None
    ai_provider = None
    ai_feedback_text = None
    misconceptions_detected = []
    score = None

    if ai_result.get("success"):
        r = ai_result["result"]
        ai_verdict = r.get("verdict")
        ai_confidence = r.get("confidence")
        ai_provider = ai_result.get("provider")
        ai_feedback_text = r.get("feedback")
        misconceptions_detected = r.get("misconceptions_detected") or []
        score = r.get("score")

    # Save result
    result = SessionActivityResult(
        session_id=session_id,
        user_id=user.id,
        activity_id=activity_id,
        concept_id=concept_id,
        response=body.response,
        ai_verdict=ai_verdict,
        ai_confidence=ai_confidence,
        ai_provider=ai_provider,
        ai_feedback=ai_feedback_text,
        misconceptions_detected=misconceptions_detected,
        attempt_number=body.attemptNumber,
        retry=(body.attemptNumber > 1),
        score=score,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    # Return AI assessment to teacher (caller decides what to show learner)
    return {
        **result.serialize(),
        "aiResult": ai_result,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. POST /api/learning/sessions/{sessionId}/concepts/{conceptId}/verdict
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/verdict")
async def submit_verdict(
    session_id: int,
    concept_id: int,
    body: VerdictRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")

    # Only teacher verdicts
    if user.id != sess.teacher_id:
        raise HTTPException(403, "Only the teacher can submit a verdict.")

    # Find the most recent explanation result for this concept
    latest_result = (await db.execute(
        select(SessionActivityResult)
        .where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.concept_id == concept_id,
            SessionActivityResult.teacher_verdict.is_(None),
        )
        .order_by(SessionActivityResult.attempt_number.desc())
        .limit(1)
    )).scalar_one_or_none()

    if latest_result is None:
        raise HTTPException(404, "No pending explanation found for this concept.")

    latest_result.teacher_verdict = body.verdict
    latest_result.teacher_comment = body.teacherComment.strip() or None

    # Determine if concept is complete
    from app.core.config import settings
    max_attempts = settings.AI_MAX_EXPLANATION_ATTEMPTS
    concept_done = (body.verdict == "approved") or (latest_result.attempt_number >= max_attempts)

    if concept_done:
        # Advance to next concept or change phase
        topic = await _load_topic_full(db, sess.topic_id)
        concepts = sorted(topic.concepts, key=lambda c: c.id)
        next_idx = sess.current_concept_idx + 1
        if next_idx < len(concepts):
            sess.current_concept_idx = next_idx
        else:
            # All concepts done → move to practice
            sess.phase = "practice"
            sess.current_concept_idx = len(concepts) - 1

    await db.commit()
    await db.refresh(sess)
    await db.refresh(latest_result)

    return {
        "result": latest_result.serialize(),
        "session": sess.serialize(),
        "conceptDone": concept_done,
        "canRetry": not concept_done and latest_result.attempt_number < max_attempts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9. GET /api/learning/sessions/{sessionId}/practice
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}/practice")
async def get_practice_questions(
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
    practice_activities = [a for a in topic.learning_activities if a.type == "practice"]
    activity_ids = {a.id for a in practice_activities}
    practice_questions = [
        q.serialize() for q in topic.questions
        if q.activity_id in activity_ids or not activity_ids
    ]

    return {
        "activities": [a.serialize() for a in practice_activities],
        "questions": practice_questions,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 10. POST /api/learning/sessions/{sessionId}/practice/{questionId}/answer
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/practice/{question_id}/answer")
async def submit_practice_answer(
    session_id: int,
    question_id: int,
    body: PracticeAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    question = (await db.execute(
        select(Question).where(Question.id == question_id, Question.topic_id == sess.topic_id)
    )).scalar_one_or_none()
    if question is None:
        raise HTTPException(404, "Question not found.")

    # Get activity_id for this question
    activity_id = question.activity_id
    if activity_id is None:
        # Fallback to first practice activity
        topic = await _load_topic_full(db, sess.topic_id)
        pa = next((a for a in topic.learning_activities if a.type == "practice"), None)
        activity_id = pa.id if pa else topic.learning_activities[0].id if topic.learning_activities else None
    if activity_id is None:
        raise HTTPException(400, "No activities configured for this topic.")

    # Check if user already answered
    existing = (await db.execute(
        select(SessionActivityResult).where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.user_id == user.id,
            SessionActivityResult.activity_id == activity_id,
            SessionActivityResult.response.isnot(None),
        )
    )).scalar_one_or_none()

    is_correct = None
    if question.answer:
        is_correct = body.response.strip().lower() == question.answer.strip().lower()

    result = SessionActivityResult(
        session_id=session_id,
        user_id=user.id,
        activity_id=activity_id,
        response=body.response,
        is_correct=is_correct,
        score=100 if is_correct else 0,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    # Check if both participants answered
    all_results = (await db.execute(
        select(SessionActivityResult).where(
            SessionActivityResult.session_id == session_id,
            SessionActivityResult.activity_id == activity_id,
        )
    )).scalars().all()

    both_answered = len({r.user_id for r in all_results}) >= 2

    response_data: dict[str, Any] = {"result": result.serialize(), "bothAnswered": both_answered}
    if both_answered:
        response_data["reveal"] = {
            "correctAnswer": question.answer,
            "explanation": question.explanation,
            "allAnswers": [
                {"userId": r.user_id, "response": r.response, "isCorrect": r.is_correct}
                for r in all_results
            ],
        }

    return response_data


# ─────────────────────────────────────────────────────────────────────────────
# 11. POST /api/learning/sessions/{sessionId}/challenge
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/challenge")
async def submit_challenge(
    session_id: int,
    body: ChallengeRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")

    if user.id != sess.learner_id:
        raise HTTPException(403, "Only the learner submits the challenge explanation.")

    topic = await _load_topic_full(db, sess.topic_id)
    subject_name = topic.subject.name if topic.subject else ""

    challenge_activity = next(
        (a for a in topic.learning_activities if a.type == "challenge"), None
    )
    activity_id = challenge_activity.id if challenge_activity else (
        topic.learning_activities[0].id if topic.learning_activities else None
    )
    if activity_id is None:
        raise HTTPException(400, "No activities configured for this topic.")

    ai_result = await verify_explanation(
        student_response=body.response,
        topic_name=topic.name,
        subject_name=subject_name,
        activity_prompt=challenge_activity.prompt if challenge_activity else "Explain the whole topic as if teaching it.",
        concepts=[c.serialize() for c in topic.concepts],
        misconceptions=[m.serialize() for m in topic.misconceptions],
        learning_objectives=[o.serialize() for o in topic.learning_objectives],
        previous_attempts=[],
    )

    ai_verdict = ai_result["result"].get("verdict") if ai_result.get("success") else None
    score = ai_result["result"].get("score") if ai_result.get("success") else None

    result = SessionActivityResult(
        session_id=session_id,
        user_id=user.id,
        activity_id=activity_id,
        response=body.response,
        ai_verdict=ai_verdict,
        ai_provider=ai_result.get("provider"),
        ai_feedback=ai_result["result"].get("feedback") if ai_result.get("success") else None,
        misconceptions_detected=ai_result["result"].get("misconceptions_detected") if ai_result.get("success") else None,
        score=score,
        is_correct=(ai_verdict == "correct") if ai_verdict else None,
    )
    db.add(result)

    # Move session to challenge phase
    sess.phase = "challenge"
    await db.commit()
    await db.refresh(result)

    return {"result": result.serialize(), "aiResult": ai_result}


# ─────────────────────────────────────────────────────────────────────────────
# 12. POST /api/learning/sessions/{sessionId}/complete
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
    sess.phase = "summary"
    sess.completed_at = _now()

    # Load all results
    all_results = (await db.execute(
        select(SessionActivityResult).where(SessionActivityResult.session_id == session_id)
    )).scalars().all()

    # Calculate scores per participant
    for uid in {sess.teacher_id, sess.learner_id} - {None}:
        user_results = [r for r in all_results if r.user_id == uid]
        explain_results = [r for r in user_results if r.ai_verdict is not None and r.score is not None]
        practice_results = [r for r in user_results if r.is_correct is not None]

        understanding_score = int(sum(r.score for r in explain_results) / len(explain_results)) if explain_results else None
        practice_score = int(sum(1 for r in practice_results if r.is_correct) / len(practice_results) * 100) if practice_results else None
        needs_review = bool(explain_results and understanding_score is not None and understanding_score < 60)

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
                needs_review=needs_review,
                last_studied_at=_now(),
            )
            db.add(progress)
        else:
            if understanding_score is not None:
                progress.understanding_score = understanding_score
            if practice_score is not None:
                progress.practice_score = practice_score
            progress.sessions_completed = (progress.sessions_completed or 0) + 1
            progress.needs_review = needs_review
            progress.last_studied_at = _now()

        # Award XP
        xp = 75 if uid == sess.learner_id else 50
        u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
        if u:
            u.xp = (u.xp or 0) + xp
            u.session_count = (u.session_count or 0) + 1

    await db.commit()

    for uid in {sess.teacher_id, sess.learner_id} - {None}:
        await progress_service.record_activity(db, uid)
        await progress_service.evaluate_badges(db, uid)

    return sess.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 13. GET /api/learning/sessions/{sessionId}/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}/summary")
async def get_summary(
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
    concepts = sorted(topic.concepts, key=lambda c: c.id)

    all_results = (await db.execute(
        select(SessionActivityResult).where(SessionActivityResult.session_id == session_id)
    )).scalars().all()

    learner_id = sess.learner_id
    teacher_id = sess.teacher_id

    def _results_for(uid: int) -> list:
        return [r for r in all_results if r.user_id == uid]

    learner_results = _results_for(learner_id) if learner_id else []
    teacher_results = _results_for(teacher_id) if teacher_id else []

    # Per-concept status for learner
    concept_results = []
    for c in concepts:
        c_results = [r for r in learner_results if r.concept_id == c.id]
        best = max(c_results, key=lambda r: r.score or 0) if c_results else None
        verdict = best.teacher_verdict if best else None
        score = best.score if best else 0
        concept_results.append({
            "conceptId": c.id,
            "conceptName": c.name,
            "understood": verdict == "approved" or (score or 0) >= 70,
            "needsReview": verdict == "retry" or (score or 0) < 60,
            "score": score,
            "attempts": len(c_results),
        })

    # Practice accuracy
    practice_r = [r for r in learner_results if r.is_correct is not None]
    practice_correct = sum(1 for r in practice_r if r.is_correct)

    # Challenge
    challenge_r = [r for r in learner_results if r.ai_verdict is not None and r.concept_id is None]
    challenge_result = challenge_r[-1].serialize() if challenge_r else None

    # Misconceptions
    all_misconceptions = []
    for r in learner_results:
        for m in (r.misconceptions_detected or []):
            if m not in all_misconceptions:
                all_misconceptions.append(m)

    teacher = (await db.execute(select(User).where(User.id == teacher_id))).scalar_one_or_none() if teacher_id else None
    learner = (await db.execute(select(User).where(User.id == learner_id))).scalar_one_or_none() if learner_id else None

    return {
        "sessionId": session_id,
        "topicName": topic.name,
        "subject": topic.subject.name if topic.subject else None,
        "subjectIcon": topic.subject.icon if topic.subject else None,
        "teacher": _user_brief(teacher) if teacher else None,
        "learner": _user_brief(learner) if learner else None,
        "conceptResults": concept_results,
        "practiceTotal": len(practice_r),
        "practiceCorrect": practice_correct,
        "challengeResult": challenge_result,
        "misconceptionsDetected": all_misconceptions,
        "learnerXpEarned": 75,
        "teacherXpEarned": 50,
        "status": sess.status,
        "startedAt": sess.started_at.isoformat() if sess.started_at else None,
        "completedAt": sess.completed_at.isoformat() if sess.completed_at else None,
    }
