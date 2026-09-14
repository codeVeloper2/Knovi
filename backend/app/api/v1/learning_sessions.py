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

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session as get_db_session
from app.core.security import current_user
from app.models.curriculum import (
    Concept, LearningActivity, LearningObjective,
    LearningSession, Misconception, Question, Resource,
    SessionActivityResult, SessionPracticeAnswer, SessionTeachingExchange,
    Subject, Topic, TopicProgress,
)
from app.models.chat import Conversation
from app.models.match import MatchRequest
from app.models.user import User
from app.schemas.base import StrictModel
from app.services import progress_service
from app.services.ai_service import verify_explanation
from app.services.learning_session_ws_manager import manager as session_ws_manager

router = APIRouter()


@router.websocket("/learning/sessions/ws/{session_id}")
async def learning_session_websocket(
    websocket: WebSocket, session_id: int, token: str = Query(...),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """State-event channel; chat messages continue to use /chat/ws/{conv_id}."""
    from app.core.security import decode_token
    try:
        token_payload = decode_token(token)
        if token_payload.get("type") != "access":
            raise ValueError("non-access token")
        user_id = int(token_payload["sub"])
        sess = await _session_or_404(db, session_id)
        await _assert_participant(sess, user_id)
    except Exception:
        await websocket.close(code=4003)
        return
    await session_ws_manager.connect(websocket, session_id)
    try:
        while True:
            # Clients may send ping only; transitions are REST-authorized.
            await websocket.receive_text()
    except WebSocketDisconnect:
        session_ws_manager.disconnect(websocket, session_id)


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
    viewer_id: Optional[int] = None,
) -> dict:
    data = sess.serialize()
    if topic:
        data["topic"] = _serialize_topic_full(topic)
    if teacher:
        data["teacher"] = _user_brief(teacher)
    if learner:
        data["learner"] = _user_brief(learner)
    if results is not None:
        data["results"] = [
            _result_for_viewer(result, viewer_id, sess.teacher_id)
            if viewer_id is not None else result.serialize()
            for result in results
        ]
    return data


def _result_for_viewer(result: SessionActivityResult, viewer_id: int, teacher_id: int) -> dict:
    """Do not return AI assessment fields outside the private teacher view."""
    data = result.serialize()
    if viewer_id != teacher_id:
        for key in ("aiFeedback", "aiVerdict", "aiConfidence", "aiProvider", "misconceptionsDetected", "score"):
            data.pop(key, None)
    return data


async def _practice_questions(db: AsyncSession, topic_id: int) -> list[Question]:
    """Use explicitly marked practice questions, falling back for legacy data."""
    activity_ids = set((await db.execute(select(LearningActivity.id).where(
        LearningActivity.topic_id == topic_id, LearningActivity.type == "practice"
    ))).scalars().all())
    statement = select(Question).where(Question.topic_id == topic_id)
    if activity_ids:
        statement = statement.where(Question.activity_id.in_(activity_ids))
    return list((await db.execute(statement.order_by(Question.id))).scalars().all())


# ─────────────────────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateSessionRequest(StrictModel):
    topicId:   int
    partnerId: int
    description: str = Field(default="", max_length=2000)


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


class TeacherExplanationRequest(StrictModel):
    explanation: str = Field(min_length=1, max_length=10000)


class TeacherFeedbackRequest(StrictModel):
    verdict: str = Field(pattern=r"^(approved|retry)$")
    teacherComment: str = Field(default="", max_length=4000)


def _same_subject(value: str, subject: str) -> bool:
    return value.strip().casefold() == subject.strip().casefold()


def _require_state(sess: LearningSession, *states: str) -> None:
    if sess.workflow_state not in states:
        raise HTTPException(409, f"This action is unavailable while the session is {sess.workflow_state}.")


def _require_teacher(sess: LearningSession, user: User) -> None:
    if user.id != sess.teacher_id:
        raise HTTPException(403, "Only the session teacher can perform this action.")


def _require_learner(sess: LearningSession, user: User) -> None:
    if user.id != sess.learner_id:
        raise HTTPException(403, "Only the session learner can perform this action.")


async def _session_or_404(db: AsyncSession, session_id: int) -> LearningSession:
    session = (await db.execute(select(LearningSession).where(LearningSession.id == session_id))).scalar_one_or_none()
    if session is None:
        raise HTTPException(404, "Session not found.")
    return session


async def _current_concept(db: AsyncSession, sess: LearningSession) -> Concept:
    if sess.current_concept_id is None:
        raise HTTPException(409, "No current concept has been started.")
    concept = (await db.execute(select(Concept).where(Concept.id == sess.current_concept_id, Concept.topic_id == sess.topic_id))).scalar_one_or_none()
    if concept is None:
        raise HTTPException(409, "The current concept is invalid.")
    return concept


def _numeric_answer(value: str) -> float | None:
    import re
    match = re.match(r"^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)", value)
    return float(match.group(1)) if match else None


def _is_correct_answer(question: Question, response: str) -> bool:
    expected = question.answer or ""
    if question.question_type == "numeric":
        actual_number, expected_number = _numeric_answer(response), _numeric_answer(expected)
        if actual_number is None or expected_number is None:
            return False
        # Curriculum currently stores the expected numeric value in `answer`.
        # A later explicit question tolerance field can be honoured here without
        # ever delegating deterministic grading to AI.
        tolerance = float(getattr(question, "numeric_tolerance", 0) or 0)
        return abs(actual_number - expected_number) <= tolerance
    return response.strip().casefold() == expected.strip().casefold()


# ─────────────────────────────────────────────────────────────────────────────
# 1. GET /api/learning/topics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/topics")
async def list_learning_topics(
    _user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
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
    db: AsyncSession = Depends(get_db_session),
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

    # A Learning Session is always created by its teacher.  Match direction is
    # historical connection metadata, never a source of session role authority.
    subject_name = topic.subject.name if topic.subject else ""
    if not any(_same_subject(item, subject_name) for item in (user.subjects_good_at or [])):
        raise HTTPException(403, "You can only create a teaching session for a subject you teach.")
    if not any(_same_subject(item, subject_name) for item in (partner.subjects_need_help or [])):
        raise HTTPException(403, "This partner has not selected this subject as one they need help with.")

    conversation = (await db.execute(
        select(Conversation).where(
            Conversation.user_a_id == min(user.id, partner.id),
            Conversation.user_b_id == max(user.id, partner.id),
        )
    )).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(409, "Your accepted connection does not have its required conversation yet.")

    code = await _generate_code(db, topic.name)
    expires = _now() + timedelta(hours=24)

    sess = LearningSession(
        creator_id=user.id,
        partner_id=partner.id,
        teacher_id=user.id,
        learner_id=partner.id,
        topic_id=body.topicId,
        goal=body.description.strip() or f"Peer teaching: {topic.name}",
        session_description=body.description.strip(),
        conversation_id=conversation.id,
        status="pending",
        phase="setup",
        current_stage="learn",
        workflow_state="LOBBY",
        current_concept_idx=0,
        session_code=code,
        expires_at=expires,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)

    teacher_user = user
    learner_user = partner

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
    db: AsyncSession = Depends(get_db_session),
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
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    if sess.status not in ("pending", "active"):
        raise HTTPException(409, "This session is no longer joinable.")
    if user.id not in (sess.creator_id, sess.partner_id, sess.teacher_id, sess.learner_id):
        raise HTTPException(403, "You are not invited to this session.")
    if sess.expires_at and sess.expires_at < _now():
        raise HTTPException(400, "This session has expired.")

    # Joining the lobby is not starting a lesson.  Only the teacher can start
    # it through the preserved /ready route (or the explicit start endpoint).
    if user.id == sess.learner_id:
        sess.learner_ready = True
        await db.commit()
        await session_ws_manager.broadcast(session_id, "session_joined", {"userId": user.id})

    topic = await _load_topic_full(db, sess.topic_id)
    teacher = (await db.execute(select(User).where(User.id == sess.teacher_id))).scalar_one_or_none()
    learner = (await db.execute(select(User).where(User.id == sess.learner_id))).scalar_one_or_none()
    results = (await db.execute(
        select(SessionActivityResult).where(SessionActivityResult.session_id == session_id)
    )).scalars().all()
    return _full_session(sess, topic, teacher, learner, list(results), viewer_id=user.id)


# ─────────────────────────────────────────────────────────────────────────────
# 5. GET /api/learning/sessions/{sessionId}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}")
async def get_learning_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
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
    return _full_session(sess, topic, teacher, learner, list(results), viewer_id=user.id)


# ─────────────────────────────────────────────────────────────────────────────
# 6. POST /api/learning/sessions/{sessionId}/ready
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/ready")
async def mark_ready(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    _require_teacher(sess, user)
    _require_state(sess, "LOBBY")
    if not sess.learner_ready:
        raise HTTPException(409, "The learner must join the lobby before the session starts.")

    first = (await db.execute(
        select(Concept).where(Concept.topic_id == sess.topic_id).order_by(Concept.id).limit(1)
    )).scalar_one_or_none()
    if first is None:
        raise HTTPException(409, "This topic has no concepts to teach.")
    # Kept as a legacy route for the current frontend, but it now means the
    # teacher starts the session; it never waits for or advances on learner input.
    sess.status = "active"
    sess.teacher_ready = True
    sess.phase = "concepts"
    sess.workflow_state = "TEACHING_CONCEPT"
    sess.current_concept_id = first.id
    sess.current_concept_idx = 0
    sess.started_at = sess.started_at or _now()

    await db.commit()

    # Re-load with explicit columns only — avoid lazy relationship access
    updated = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one()
    await session_ws_manager.broadcast(session_id, "session_started", {"workflowState": updated.workflow_state})
    return updated.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 7. POST /api/learning/sessions/{sessionId}/concepts/{conceptId}/explanation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/start")
async def start_learning_session(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Explicit teacher-only alias for the legacy /ready start action."""
    return await mark_ready(session_id, user, db)


@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/teach")
async def send_teacher_explanation(
    session_id: int, concept_id: int, body: TeacherExplanationRequest,
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "TEACHING_CONCEPT")
    if sess.current_concept_id != concept_id:
        raise HTTPException(409, "This is not the active concept.")
    exchange = (await db.execute(select(SessionTeachingExchange).where(
        SessionTeachingExchange.session_id == session_id, SessionTeachingExchange.concept_id == concept_id
    ))).scalar_one_or_none()
    if exchange is None:
        exchange = SessionTeachingExchange(session_id=session_id, concept_id=concept_id, teacher_id=user.id, explanation=body.explanation.strip())
        db.add(exchange)
    else:
        exchange.explanation = body.explanation.strip()
        exchange.learner_read_at = None
        exchange.explain_back_requested_at = None
    sess.workflow_state = "LEARNER_READING"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "teacher_explanation_sent", {"conceptId": concept_id, "explanation": exchange.explanation})
    return {"conceptId": concept_id, "sent": True, "workflowState": sess.workflow_state}


@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/read")
async def acknowledge_teacher_explanation(
    session_id: int, concept_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_learner(sess, user)
    _require_state(sess, "LEARNER_READING")
    exchange = (await db.execute(select(SessionTeachingExchange).where(
        SessionTeachingExchange.session_id == session_id, SessionTeachingExchange.concept_id == concept_id
    ))).scalar_one_or_none()
    if exchange is None:
        raise HTTPException(409, "No teacher explanation is awaiting acknowledgement.")
    exchange.learner_read_at = _now()
    await db.commit()
    await session_ws_manager.broadcast(session_id, "learner_read_explanation", {"conceptId": concept_id})
    return {"conceptId": concept_id, "read": True, "workflowState": sess.workflow_state}


@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/request-explanation")
async def request_explain_back(
    session_id: int, concept_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "LEARNER_READING")
    exchange = (await db.execute(select(SessionTeachingExchange).where(
        SessionTeachingExchange.session_id == session_id, SessionTeachingExchange.concept_id == concept_id
    ))).scalar_one_or_none()
    if exchange is None or exchange.learner_read_at is None:
        raise HTTPException(409, "The learner must acknowledge the explanation first.")
    exchange.explain_back_requested_at = _now()
    sess.workflow_state = "EXPLAIN_BACK_REQUESTED"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "teacher_requested_explanation", {"conceptId": concept_id})
    return {"conceptId": concept_id, "requested": True, "workflowState": sess.workflow_state}


@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/begin-explanation")
async def begin_explain_back(
    session_id: int, concept_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_learner(sess, user)
    _require_state(sess, "EXPLAIN_BACK_REQUESTED")
    if sess.current_concept_id != concept_id:
        raise HTTPException(409, "This is not the active concept.")
    sess.workflow_state = "LEARNER_EXPLAINING"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "learner_explanation_started", {"conceptId": concept_id})
    return {"conceptId": concept_id, "started": True, "workflowState": sess.workflow_state}


@router.get("/learning/sessions/{session_id}/teacher-review")
async def teacher_review_queue(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    results = (await db.execute(select(SessionActivityResult).where(
        SessionActivityResult.session_id == session_id, SessionActivityResult.user_id == sess.learner_id,
        SessionActivityResult.concept_id == sess.current_concept_id,
    ).order_by(SessionActivityResult.attempt_number.desc()))).scalars().all()
    return {"results": [result.serialize() for result in results], "workflowState": sess.workflow_state}


@router.post("/learning/sessions/{session_id}/next-concept")
async def start_next_concept(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "NEXT_CONCEPT")
    concepts = (await db.execute(select(Concept).where(Concept.topic_id == sess.topic_id).order_by(Concept.id))).scalars().all()
    next_index = sess.current_concept_idx + 1
    if next_index >= len(concepts):
        raise HTTPException(409, "All concepts are complete. Start practice instead.")
    sess.current_concept_idx = next_index
    sess.current_concept_id = concepts[next_index].id
    sess.workflow_state = "TEACHING_CONCEPT"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "next_concept_started", {"conceptId": sess.current_concept_id})
    return sess.serialize()

@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/explanation")
async def submit_explanation(
    session_id: int,
    concept_id: int,
    body: ExplanationRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    _require_learner(sess, user)
    _require_state(sess, "LEARNER_EXPLAINING")
    if sess.current_concept_id != concept_id:
        raise HTTPException(409, "This is not the concept currently being taught.")

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
    sess.workflow_state = "TEACHER_REVIEW"
    await db.commit()
    await db.refresh(result)

    await session_ws_manager.broadcast(session_id, "learner_explanation_submitted", {"conceptId": concept_id})
    # The learner receives only a receipt.  The AI assessment is available to
    # the teacher through the authenticated teacher-review endpoint.
    return {"id": result.id, "conceptId": concept_id, "submitted": True, "workflowState": sess.workflow_state}


# ─────────────────────────────────────────────────────────────────────────────
# 8. POST /api/learning/sessions/{sessionId}/concepts/{conceptId}/verdict
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/concepts/{concept_id}/verdict")
async def submit_verdict(
    session_id: int,
    concept_id: int,
    body: VerdictRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")

    _require_teacher(sess, user)
    _require_state(sess, "TEACHER_REVIEW")

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

    # Approval makes the concept eligible for the teacher's explicit "start
    # next concept" action.  It never auto-advances the learner.
    sess.workflow_state = "NEXT_CONCEPT" if concept_done else "LEARNER_EXPLAINING"

    await db.commit()
    await db.refresh(sess)
    await db.refresh(latest_result)

    await session_ws_manager.broadcast(session_id, "teacher_feedback_sent", {"conceptId": concept_id, "verdict": body.verdict, "conceptDone": concept_done})
    return {
        "result": latest_result.serialize(),
        "session": sess.serialize(),
        "conceptDone": concept_done,
        "canRetry": not concept_done and latest_result.attempt_number < max_attempts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9. GET /api/learning/sessions/{sessionId}/practice
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/practice/start")
async def start_practice(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "NEXT_CONCEPT")
    concepts = (await db.execute(select(Concept.id).where(Concept.topic_id == sess.topic_id))).scalars().all()
    completed = (await db.execute(select(SessionActivityResult.concept_id).where(
        SessionActivityResult.session_id == session_id, SessionActivityResult.teacher_verdict == "approved"
    ))).scalars().all()
    if not concepts or not set(concepts).issubset(set(completed)):
        raise HTTPException(409, "Every concept must be approved before practice starts.")
    questions = await _practice_questions(db, sess.topic_id)
    question = questions[0] if questions else None
    if question is None:
        raise HTTPException(409, "This topic has no practice questions.")
    sess.phase, sess.workflow_state, sess.current_practice_question_id = "practice", "PRACTICE", question.id
    await db.commit()
    await session_ws_manager.broadcast(session_id, "practice_started", {"questionId": question.id})
    return sess.serialize()

@router.get("/learning/sessions/{session_id}/practice")
async def get_practice_questions(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    _require_state(sess, "PRACTICE", "PRACTICE_REVEAL")
    question = (await db.execute(select(Question).where(Question.id == sess.current_practice_question_id))).scalar_one_or_none()
    if question is None:
        raise HTTPException(409, "No active practice question.")
    own = (await db.execute(select(SessionPracticeAnswer).where(
        SessionPracticeAnswer.session_id == session_id, SessionPracticeAnswer.question_id == question.id,
        SessionPracticeAnswer.user_id == user.id,
    ))).scalar_one_or_none()
    payload = question.serialize()
    payload.pop("answer", None)
    payload.pop("explanation", None)
    # Keep the existing `questions` array contract while limiting it to the
    # server-selected question; answers/explanations remain absent until reveal.
    data: dict[str, Any] = {"question": payload, "questions": [payload], "activities": [],
                            "submitted": own is not None, "workflowState": sess.workflow_state}
    if sess.workflow_state == "PRACTICE_REVEAL":
        answers = (await db.execute(select(SessionPracticeAnswer).where(
            SessionPracticeAnswer.session_id == session_id, SessionPracticeAnswer.question_id == question.id
        ))).scalars().all()
        data["reveal"] = {"correctAnswer": question.answer, "explanation": question.explanation,
                          "allAnswers": [{"userId": a.user_id, "response": a.response, "isCorrect": a.is_correct} for a in answers]}
    return data


# ─────────────────────────────────────────────────────────────────────────────
# 10. POST /api/learning/sessions/{sessionId}/practice/{questionId}/answer
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/practice/{question_id}/answer")
async def submit_practice_answer(
    session_id: int,
    question_id: int,
    body: PracticeAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    await _assert_participant(sess, user.id)

    _require_state(sess, "PRACTICE")
    if sess.current_practice_question_id != question_id:
        raise HTTPException(409, "This is not the active practice question.")
    question = (await db.execute(
        select(Question).where(Question.id == question_id, Question.topic_id == sess.topic_id)
    )).scalar_one_or_none()
    if question is None:
        raise HTTPException(404, "Question not found.")

    existing = (await db.execute(select(SessionPracticeAnswer).where(
        SessionPracticeAnswer.session_id == session_id, SessionPracticeAnswer.question_id == question_id,
        SessionPracticeAnswer.user_id == user.id,
    ))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "You already submitted an answer for this question.")
    result = SessionPracticeAnswer(session_id=session_id, question_id=question_id, user_id=user.id,
                                   response=body.response.strip(), is_correct=_is_correct_answer(question, body.response))
    db.add(result)
    await db.commit()
    await db.refresh(result)

    # Check if both participants answered
    all_results = (await db.execute(
        select(SessionPracticeAnswer).where(
            SessionPracticeAnswer.session_id == session_id,
            SessionPracticeAnswer.question_id == question_id,
        )
    )).scalars().all()

    both_answered = len({r.user_id for r in all_results}) >= 2

    response_data: dict[str, Any] = {"submitted": True, "bothAnswered": both_answered}
    if both_answered:
        sess.workflow_state = "PRACTICE_REVEAL"
        response_data["reveal"] = {
            "correctAnswer": question.answer,
            "explanation": question.explanation,
            "allAnswers": [
                {"userId": r.user_id, "response": r.response, "isCorrect": r.is_correct}
                for r in all_results
            ],
        }

    await db.commit()
    await session_ws_manager.broadcast(session_id, "practice_answer_submitted", {"userId": user.id})
    if both_answered:
        await session_ws_manager.broadcast(session_id, "practice_answers_revealed", response_data["reveal"])
    return response_data


# ─────────────────────────────────────────────────────────────────────────────
# 11. POST /api/learning/sessions/{sessionId}/challenge
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/practice/next")
async def next_practice_question(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "PRACTICE_REVEAL")
    questions = await _practice_questions(db, sess.topic_id)
    current = next((i for i, question in enumerate(questions) if question.id == sess.current_practice_question_id), -1)
    if current < 0 or current + 1 >= len(questions):
        raise HTTPException(409, "There are no further practice questions. Start role reversal instead.")
    sess.current_practice_question_id = questions[current + 1].id
    sess.workflow_state = "PRACTICE"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "next_practice_question", {"questionId": sess.current_practice_question_id})
    return sess.serialize()


@router.post("/learning/sessions/{session_id}/role-reversal/start")
async def start_role_reversal(
    session_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "PRACTICE_REVEAL")
    questions = [question.id for question in await _practice_questions(db, sess.topic_id)]
    answers = (await db.execute(select(SessionPracticeAnswer).where(
        SessionPracticeAnswer.session_id == session_id
    ))).scalars().all()
    if any({answer.user_id for answer in answers if answer.question_id == question_id} != {sess.teacher_id, sess.learner_id}
           for question_id in questions):
        raise HTTPException(409, "All practice questions must be answered by both participants first.")
    sess.phase, sess.workflow_state = "challenge", "ROLE_REVERSAL"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "role_reversal_started", {})
    return sess.serialize()

@router.post("/learning/sessions/{session_id}/challenge")
async def submit_challenge(
    session_id: int,
    body: ChallengeRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")

    _require_learner(sess, user)
    _require_state(sess, "ROLE_REVERSAL")

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

    # The original learner is now the teacher.  Their explanation remains
    # pending private review by the original teacher.
    sess.phase = "challenge"
    sess.workflow_state = "TEACHER_REVIEW"
    await db.commit()
    await db.refresh(result)

    await session_ws_manager.broadcast(session_id, "challenge_submitted", {})
    return {"submitted": True, "workflowState": sess.workflow_state}


# ─────────────────────────────────────────────────────────────────────────────
# 12. POST /api/learning/sessions/{sessionId}/complete
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/learning/sessions/{session_id}/role-reversal/feedback")
async def review_role_reversal(
    session_id: int, body: TeacherFeedbackRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = await _session_or_404(db, session_id)
    _require_teacher(sess, user)
    _require_state(sess, "TEACHER_REVIEW")
    result = (await db.execute(select(SessionActivityResult).where(
        SessionActivityResult.session_id == session_id, SessionActivityResult.user_id == sess.learner_id,
        SessionActivityResult.concept_id.is_(None), SessionActivityResult.teacher_verdict.is_(None),
    ).order_by(SessionActivityResult.created_at.desc()).limit(1))).scalar_one_or_none()
    if result is None:
        raise HTTPException(409, "There is no role-reversal explanation awaiting review.")
    result.teacher_verdict, result.teacher_comment = body.verdict, body.teacherComment.strip() or None
    # A retry keeps the learner in the genuine role-reversal task.  Approval
    # allows completion but does not complete it automatically.
    sess.workflow_state = "ROLE_REVERSAL" if body.verdict == "retry" else "NEXT_CONCEPT"
    await db.commit()
    await session_ws_manager.broadcast(session_id, "teacher_feedback_sent", {"roleReversal": True, "verdict": body.verdict})
    return {"reviewed": True, "workflowState": sess.workflow_state}

@router.post("/learning/sessions/{session_id}/complete")
async def complete_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sess = (await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(404, "Session not found.")
    _require_teacher(sess, user)

    if sess.status == "completed":
        return sess.serialize()

    if sess.workflow_state != "NEXT_CONCEPT" or sess.phase != "challenge":
        raise HTTPException(409, "The session cannot be completed until role reversal has been approved.")
    concept_ids = set((await db.execute(select(Concept.id).where(Concept.topic_id == sess.topic_id))).scalars().all())
    approved_concepts = set((await db.execute(select(SessionActivityResult.concept_id).where(
        SessionActivityResult.session_id == session_id, SessionActivityResult.teacher_verdict == "approved",
        SessionActivityResult.concept_id.isnot(None),
    ))).scalars().all())
    if not concept_ids.issubset(approved_concepts):
        raise HTTPException(409, "Every concept must be approved before completion.")
    question_ids = {question.id for question in await _practice_questions(db, sess.topic_id)}
    practice_answers = (await db.execute(select(SessionPracticeAnswer).where(
        SessionPracticeAnswer.session_id == session_id
    ))).scalars().all()
    for question_id in question_ids:
        if {answer.user_id for answer in practice_answers if answer.question_id == question_id} != {sess.teacher_id, sess.learner_id}:
            raise HTTPException(409, "Both participants must complete every practice question.")

    sess.status = "completed"
    sess.phase = "summary"
    sess.workflow_state = "COMPLETED"
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

    await session_ws_manager.broadcast(session_id, "session_completed", {"sessionId": session_id})
    return sess.serialize()


# ─────────────────────────────────────────────────────────────────────────────
# 13. GET /api/learning/sessions/{sessionId}/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/learning/sessions/{session_id}/summary")
async def get_summary(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db_session),
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
