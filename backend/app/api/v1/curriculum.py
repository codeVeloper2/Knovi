"""Student-facing read-only curriculum endpoints.

All routes are publicly accessible to any authenticated user (student or
admin). Students can READ curriculum but never create / edit / delete it.

Route prefix (mounted in main.py): /api
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import current_user
from app.models.curriculum import (
    Concept, LearningActivity, LearningObjective,
    Misconception, Question, Resource, Subject, Topic,
)
from app.models.user import User
from app.schemas.curriculum import (
    ActivityOut, ConceptOut, MisconceptionOut,
    ObjectiveOut, QuestionOut, ResourceOut,
    SubjectOut, TopicDetailOut, TopicOut,
)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# SUBJECTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SubjectOut]:
    rows = (await session.execute(
        select(Subject).where(Subject.is_active == True).order_by(Subject.name)  # noqa: E712
    )).scalars().all()
    return [SubjectOut(**r.serialize()) for r in rows]


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
async def get_subject(
    subject_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SubjectOut:
    subj = (await session.execute(
        select(Subject).where(Subject.id == subject_id, Subject.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if subj is None:
        raise HTTPException(404, "Subject not found.")
    return SubjectOut(**subj.serialize())


@router.get("/subjects/{subject_id}/topics", response_model=list[TopicOut])
async def list_subject_topics(
    subject_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TopicOut]:
    # Verify subject exists
    subj = (await session.execute(
        select(Subject).where(Subject.id == subject_id, Subject.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if subj is None:
        raise HTTPException(404, "Subject not found.")
    rows = (await session.execute(
        select(Topic)
        .where(Topic.subject_id == subject_id, Topic.is_active == True)  # noqa: E712
        .order_by(Topic.name)
    )).scalars().all()
    return [TopicOut(**r.serialize()) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# TOPICS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/topics/{topic_id}", response_model=TopicOut)
async def get_topic(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TopicOut:
    topic = (await session.execute(
        select(Topic).where(Topic.id == topic_id, Topic.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(404, "Topic not found.")
    return TopicOut(**topic.serialize())


@router.get("/topics/{topic_id}/objectives", response_model=list[ObjectiveOut])
async def get_topic_objectives(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ObjectiveOut]:
    _require_active_topic(await _load_topic(session, topic_id))
    rows = (await session.execute(
        select(LearningObjective)
        .where(LearningObjective.topic_id == topic_id)
        .order_by(LearningObjective.order_index)
    )).scalars().all()
    return [ObjectiveOut(**r.serialize()) for r in rows]


@router.get("/topics/{topic_id}/concepts", response_model=list[ConceptOut])
async def get_topic_concepts(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConceptOut]:
    _require_active_topic(await _load_topic(session, topic_id))
    rows = (await session.execute(
        select(Concept).where(Concept.topic_id == topic_id).order_by(Concept.id)
    )).scalars().all()
    return [ConceptOut(**r.serialize()) for r in rows]


@router.get("/topics/{topic_id}/activities", response_model=list[ActivityOut])
async def get_topic_activities(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ActivityOut]:
    _require_active_topic(await _load_topic(session, topic_id))
    rows = (await session.execute(
        select(LearningActivity)
        .where(LearningActivity.topic_id == topic_id)
        .order_by(LearningActivity.order_index)
    )).scalars().all()
    return [ActivityOut(**r.serialize()) for r in rows]


@router.get("/topics/{topic_id}/questions", response_model=list[QuestionOut])
async def get_topic_questions(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[QuestionOut]:
    _require_active_topic(await _load_topic(session, topic_id))
    rows = (await session.execute(
        select(Question).where(Question.topic_id == topic_id).order_by(Question.id)
    )).scalars().all()
    return [QuestionOut(**r.serialize()) for r in rows]


@router.get("/topics/{topic_id}/resources", response_model=list[ResourceOut])
async def get_topic_resources(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ResourceOut]:
    _require_active_topic(await _load_topic(session, topic_id))
    rows = (await session.execute(
        select(Resource).where(Resource.topic_id == topic_id).order_by(Resource.id)
    )).scalars().all()
    return [ResourceOut(**r.serialize()) for r in rows]


@router.get("/topics/{topic_id}/learning-content", response_model=TopicDetailOut)
async def get_topic_full_content(
    topic_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TopicDetailOut:
    """Return a topic with all curriculum content — used by the AI session layer."""
    stmt = (
        select(Topic)
        .where(Topic.id == topic_id, Topic.is_active == True)  # noqa: E712
        .options(
            selectinload(Topic.learning_objectives),
            selectinload(Topic.concepts),
            selectinload(Topic.misconceptions),
            selectinload(Topic.learning_activities),
            selectinload(Topic.questions),
            selectinload(Topic.resources),
        )
    )
    topic = (await session.execute(stmt)).scalar_one_or_none()
    if topic is None:
        raise HTTPException(404, "Topic not found.")
    return TopicDetailOut(
        **topic.serialize(),
        learning_objectives=[ObjectiveOut(**o.serialize()) for o in topic.learning_objectives],
        concepts=[ConceptOut(**c.serialize()) for c in topic.concepts],
        misconceptions=[MisconceptionOut(**m.serialize()) for m in topic.misconceptions],
        learning_activities=[ActivityOut(**a.serialize()) for a in topic.learning_activities],
        questions=[QuestionOut(**q.serialize()) for q in topic.questions],
        resources=[ResourceOut(**r.serialize()) for r in topic.resources],
    )


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def _load_topic(session: AsyncSession, topic_id: int) -> Topic | None:
    return (await session.execute(
        select(Topic).where(Topic.id == topic_id)
    )).scalar_one_or_none()


def _require_active_topic(topic: Topic | None) -> None:
    if topic is None or not topic.is_active:
        raise HTTPException(404, "Topic not found.")
