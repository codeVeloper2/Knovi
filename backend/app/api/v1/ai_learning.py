"""AI Learning Session API — PeerUP.

All endpoints require authentication. user_id is always sourced from the
auth dependency, never from the request body.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.schemas.ai_learning import (
    AnswerOut,
    CreateSessionRequest,
    FinishStudyPeriodRequest,
    IntegrityEventOut,
    IntegrityEventRequest,
    MessageOut,
    QuestionOut,
    RequestReteachRequest,
    SessionListItem,
    SessionOut,
    StartStudyPeriodRequest,
    StudentMessageRequest,
    SummaryOut,
    TeachingAttemptOut,
    TeachingOut,
    SubmitAnswerRequest,
)
from app.services import ai_learning_service as svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

@router.post("/learning/sessions", response_model=SessionOut, status_code=201)
async def create_session(
    body: CreateSessionRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Create a new AI learning session."""
    session = await svc.create_session(
        user_id=user.id,
        subject_id=body.subject_id,
        topic_id=body.topic_id,
        concept_id=body.concept_id,
        student_familiarity=body.student_familiarity,
        student_note=body.student_note,
        intent=body.intent,
        custom_intent_text=body.custom_intent_text,
        db=db,
    )
    return session.serialize()


@router.get("/learning/sessions", response_model=list[SessionListItem])
async def list_sessions(
    status: Optional[str] = Query(default=None),
    subject_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """List the authenticated user's learning sessions."""
    return await svc.list_sessions(
        user_id=user.id, db=db,
        status=status, subject_id=subject_id,
        limit=limit, offset=offset,
    )


@router.get("/learning/sessions/{session_id}", response_model=dict)
async def get_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get a full learning session (owner only)."""
    return await svc.get_session(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/abandon", response_model=SessionOut)
async def abandon_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Abandon a session."""
    return await svc.abandon_session(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/complete", response_model=SessionOut)
async def complete_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Force-complete a session without generating a summary."""
    return await svc.complete_session(session_id=session_id, user_id=user.id, db=db)


# ---------------------------------------------------------------------------
# Teaching
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/teach", response_model=TeachingOut)
async def teach_concept(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Generate AI teaching content for this session's concept."""
    return await svc.teach_concept(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/message", response_model=MessageOut)
async def student_message(
    session_id: int,
    body: StudentMessageRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Send a student message and receive an AI tutor response."""
    return await svc.respond_to_student(
        session_id=session_id, user_id=user.id,
        content=body.content, db=db,
    )


# ---------------------------------------------------------------------------
# Study timer
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/study/start", response_model=dict)
async def start_study_period(
    session_id: int,
    body: StartStudyPeriodRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Start a study/reading timer period."""
    return await svc.start_study_period(
        session_id=session_id, user_id=user.id,
        duration_seconds=body.duration_seconds, db=db,
    )


@router.post("/learning/sessions/{session_id}/study/finish", response_model=dict)
async def finish_study_period(
    session_id: int,
    body: FinishStudyPeriodRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Complete a study period and transition to retrieval."""
    return await svc.finish_study_period(
        session_id=session_id, user_id=user.id,
        study_period_id=body.study_period_id, db=db,
    )


# ---------------------------------------------------------------------------
# Retrieval questions
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/questions", response_model=list[QuestionOut])
async def generate_questions(
    session_id: int,
    count: int = Query(default=3, ge=1, le=10),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Generate retrieval questions grounded in what was taught."""
    return await svc.generate_retrieval_questions(
        session_id=session_id, user_id=user.id, db=db, count=count,
    )


# ---------------------------------------------------------------------------
# Answer submission
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/answers", response_model=AnswerOut)
async def submit_answer(
    session_id: int,
    body: SubmitAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Submit and evaluate a student answer."""
    return await svc.submit_answer(
        session_id=session_id, user_id=user.id,
        question_id=body.question_id,
        student_answer=body.student_answer,
        response_time_seconds=body.response_time_seconds,
        db=db,
    )


# ---------------------------------------------------------------------------
# Adaptive reteaching
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/reteach", response_model=TeachingOut)
async def reteach(
    session_id: int,
    body: RequestReteachRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Generate adaptive reteaching using a fresh strategy."""
    return await svc.generate_adaptive_reteach(
        session_id=session_id, user_id=user.id,
        reason=body.reason, db=db,
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/summary", response_model=SummaryOut)
async def generate_summary(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Generate (or regenerate) the session summary."""
    return await svc.generate_session_summary(
        session_id=session_id, user_id=user.id, db=db,
    )


# ---------------------------------------------------------------------------
# Integrity events
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/integrity", response_model=IntegrityEventOut)
async def record_integrity_event(
    session_id: int,
    body: IntegrityEventRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Record a browser integrity signal (learning signal, not anti-cheat)."""
    return await svc.record_integrity_event(
        session_id=session_id, user_id=user.id,
        event_type=body.event_type, meta=body.meta, db=db,
    )
