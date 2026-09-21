"""AI Learning Session API — PeerUP.

All endpoints require authentication. user_id is always sourced from the
auth dependency, never from the request body.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session as get_db
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
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
):
    """
    Get a full learning session (owner only).

    Teaching content is automatically hidden when the session is in
    retrieval or practice states to prevent answer leakage.
    """
    return await svc.get_session(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/prepare", response_model=TeachingOut)
async def prepare_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Prepare the first AI teaching response from the saved session context."""
    return await svc.teach_concept(session_id=session_id, user_id=user.id, db=db)


@router.get("/learning/sessions/{session_id}/messages", response_model=list[MessageOut])
async def get_session_messages(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return session messages (owner only).

    Teaching/reteach messages are filtered out during protected states
    (retrieval, practice) to prevent answer leakage.
    """
    return await svc.get_session_messages(
        session_id=session_id, user_id=user.id, db=db
    )


@router.post("/learning/sessions/{session_id}/abandon", response_model=SessionOut)
async def abandon_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Abandon a session (marks it as abandoned, not completed)."""
    return await svc.abandon_session(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/complete", response_model=SessionOut)
async def complete_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a session as completed.

    Guard: session must have reached retrieval or practice state first.
    Attempting to complete from 'created' or 'teaching' raises 409.
    Use /abandon to exit early sessions.
    """
    return await svc.complete_session(session_id=session_id, user_id=user.id, db=db)


# ---------------------------------------------------------------------------
# Teaching
# ---------------------------------------------------------------------------

@router.post("/learning/sessions/{session_id}/teach", response_model=TeachingOut)
async def teach_concept(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate AI teaching content for this session's concept.

    The strategy is selected based on session intent and previous strategies used.
    """
    return await svc.teach_concept(session_id=session_id, user_id=user.id, db=db)


@router.post("/learning/sessions/{session_id}/message", response_model=MessageOut)
async def student_message(
    session_id: int,
    body: StudentMessageRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
):
    """
    Start a study/reading timer period.

    Rejects if an active study period already exists for this session.
    """
    return await svc.start_study_period(
        session_id=session_id, user_id=user.id,
        duration_seconds=body.duration_seconds, db=db,
    )


@router.post("/learning/sessions/{session_id}/study/finish", response_model=dict)
async def finish_study_period(
    session_id: int,
    body: FinishStudyPeriodRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Complete a study period and transition to retrieval.

    Server-authoritative: validates server time against expected_end_at.
    Rejects if less than 20% of allocated study time has elapsed.
    """
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
    db: AsyncSession = Depends(get_db),
):
    """
    Generate retrieval questions grounded in what was actually taught.

    expected_answer and rubric are stored server-side and never sent to the student.
    """
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
    db: AsyncSession = Depends(get_db),
):
    """
    Submit and evaluate a student answer.

    Returns AnswerOut including:
      - understanding: strong | partial | weak
      - needsReteach: bool
      - misconception: identified misconception or null
      - recommendedStrategy: reteach strategy suggestion or null
    """
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
    db: AsyncSession = Depends(get_db),
):
    """
    Generate adaptive reteaching using a fresh strategy.

    The new strategy is chosen to be different from all previously used strategies.
    Identified misconceptions from answer evaluations are passed to the AI.
    """
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
    db: AsyncSession = Depends(get_db),
):
    """
    Generate (or regenerate) the session summary.

    Uses best-per-question scoring: multiple failed attempts on one question
    do not dilute the final score if the student eventually answered correctly.
    """
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
    db: AsyncSession = Depends(get_db),
):
    """
    Record a browser integrity signal.

    This is a learning signal system — it records context, not anti-cheat enforcement.
    """
    return await svc.record_integrity_event(
        session_id=session_id, user_id=user.id,
        event_type=body.event_type, meta=body.meta, db=db,
    )

@router.post("/learning/sessions/{session_id}/tasks", response_model=list)
async def generate_task_list(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a task list for the session concept.
    Called once after session creation / on first room load.
    Returns a list of task objects.
    """
    return await svc.generate_task_list(
        session_id=session_id, user_id=user.id, db=db,
    )
