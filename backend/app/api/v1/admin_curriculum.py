"""Curriculum Admin API — protected endpoints for populating curriculum content.

All routes require role='admin'.  A student calling any of these endpoints
will receive HTTP 403 regardless of how they discovered the URL.

Route prefix (mounted in main.py): /api/admin
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.dependencies import admin_user
from app.models.curriculum import (
    Concept, LearningActivity, LearningObjective,
    Misconception, Question, Resource, Subject, Topic,
)
from app.models.user import User
from app.schemas.curriculum import (
    ActivityCreate, ActivityOut, ActivityUpdate,
    ConceptCreate, ConceptOut, ConceptUpdate,
    MisconceptionCreate, MisconceptionOut, MisconceptionUpdate,
    ObjectiveCreate, ObjectiveOut, ObjectiveUpdate,
    QuestionCreate, QuestionOut, QuestionUpdate,
    ResourceCreate, ResourceOut, ResourceUpdate,
    SubjectCreate, SubjectOut, SubjectUpdate,
    TopicCreate, TopicDetailOut, TopicOut, TopicUpdate,
)

router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# SUBJECTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(
    active_only: bool = Query(False),
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[SubjectOut]:
    stmt = select(Subject).order_by(Subject.name)
    if active_only:
        stmt = stmt.where(Subject.is_active == True)  # noqa: E712
    rows = (await session.execute(stmt)).scalars().all()
    return [SubjectOut(**r.serialize()) for r in rows]


@router.post("/subjects", response_model=SubjectOut, status_code=201)
async def create_subject(
    body: SubjectCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> SubjectOut:
    # Check for duplicate name / slug
    existing = (await session.execute(
        select(Subject).where(
            (Subject.name == body.name) | (Subject.slug == body.slug)
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "A subject with that name or slug already exists.")

    subj = Subject(**body.model_dump())
    session.add(subj)
    await session.commit()
    await session.refresh(subj)
    return SubjectOut(**subj.serialize())


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
async def get_subject(
    subject_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> SubjectOut:
    subj = await _get_or_404(session, Subject, subject_id)
    return SubjectOut(**subj.serialize())


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
async def update_subject(
    subject_id: int,
    body: SubjectUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> SubjectOut:
    subj = await _get_or_404(session, Subject, subject_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(subj, field, value)
    await session.commit()
    await session.refresh(subj)
    return SubjectOut(**subj.serialize())


@router.delete("/subjects/{subject_id}", status_code=204)
async def delete_subject(
    subject_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    subj = await _get_or_404(session, Subject, subject_id)
    await session.delete(subj)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# TOPICS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics", response_model=list[TopicOut])
async def list_topics(
    subject_id: Optional[int] = Query(None),
    active_only: bool = Query(False),
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[TopicOut]:
    stmt = select(Topic).order_by(Topic.name)
    if subject_id:
        stmt = stmt.where(Topic.subject_id == subject_id)
    if active_only:
        stmt = stmt.where(Topic.is_active == True)  # noqa: E712
    rows = (await session.execute(stmt)).scalars().all()
    return [TopicOut(**r.serialize()) for r in rows]


@router.post("/topics", response_model=TopicOut, status_code=201)
async def create_topic(
    body: TopicCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> TopicOut:
    # Verify subject exists
    await _get_or_404(session, Subject, body.subject_id, label="Subject")
    # Check unique slug within subject
    existing = (await session.execute(
        select(Topic).where(
            Topic.subject_id == body.subject_id,
            Topic.slug == body.slug,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "A topic with that slug already exists in this subject.")

    topic = Topic(**body.model_dump())
    session.add(topic)
    await session.commit()
    await session.refresh(topic)
    return TopicOut(**topic.serialize())


@router.get("/topics/{topic_id}", response_model=TopicDetailOut)
async def get_topic(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> TopicDetailOut:
    """Returns a topic with all its curriculum content loaded."""
    stmt = (
        select(Topic)
        .where(Topic.id == topic_id)
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


@router.patch("/topics/{topic_id}", response_model=TopicOut)
async def update_topic(
    topic_id: int,
    body: TopicUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> TopicOut:
    topic = await _get_or_404(session, Topic, topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(topic, field, value)
    await session.commit()
    await session.refresh(topic)
    return TopicOut(**topic.serialize())


@router.delete("/topics/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    topic = await _get_or_404(session, Topic, topic_id)
    await session.delete(topic)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# LEARNING OBJECTIVES
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/objectives", response_model=list[ObjectiveOut])
async def list_objectives(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[ObjectiveOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(LearningObjective)
        .where(LearningObjective.topic_id == topic_id)
        .order_by(LearningObjective.order_index)
    )).scalars().all()
    return [ObjectiveOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/objectives", response_model=ObjectiveOut, status_code=201)
async def add_objective(
    topic_id: int,
    body: ObjectiveCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ObjectiveOut:
    await _get_or_404(session, Topic, topic_id)
    obj = LearningObjective(topic_id=topic_id, **body.model_dump())
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return ObjectiveOut(**obj.serialize())


@router.patch("/topics/{topic_id}/objectives/{obj_id}", response_model=ObjectiveOut)
async def update_objective(
    topic_id: int,
    obj_id: int,
    body: ObjectiveUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ObjectiveOut:
    obj = await _get_child_or_404(session, LearningObjective, obj_id, "topic_id", topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await session.commit()
    await session.refresh(obj)
    return ObjectiveOut(**obj.serialize())


@router.delete("/topics/{topic_id}/objectives/{obj_id}", status_code=204)
async def delete_objective(
    topic_id: int,
    obj_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    obj = await _get_child_or_404(session, LearningObjective, obj_id, "topic_id", topic_id)
    await session.delete(obj)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# CONCEPTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/concepts", response_model=list[ConceptOut])
async def list_concepts(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConceptOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(Concept).where(Concept.topic_id == topic_id).order_by(Concept.id)
    )).scalars().all()
    return [ConceptOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/concepts", response_model=ConceptOut, status_code=201)
async def add_concept(
    topic_id: int,
    body: ConceptCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ConceptOut:
    await _get_or_404(session, Topic, topic_id)
    concept = Concept(topic_id=topic_id, **body.model_dump())
    session.add(concept)
    await session.commit()
    await session.refresh(concept)
    return ConceptOut(**concept.serialize())


@router.patch("/topics/{topic_id}/concepts/{concept_id}", response_model=ConceptOut)
async def update_concept(
    topic_id: int,
    concept_id: int,
    body: ConceptUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ConceptOut:
    concept = await _get_child_or_404(session, Concept, concept_id, "topic_id", topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(concept, field, value)
    await session.commit()
    await session.refresh(concept)
    return ConceptOut(**concept.serialize())


@router.delete("/topics/{topic_id}/concepts/{concept_id}", status_code=204)
async def delete_concept(
    topic_id: int,
    concept_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    concept = await _get_child_or_404(session, Concept, concept_id, "topic_id", topic_id)
    await session.delete(concept)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# MISCONCEPTIONS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/misconceptions", response_model=list[MisconceptionOut])
async def list_misconceptions(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[MisconceptionOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(Misconception).where(Misconception.topic_id == topic_id).order_by(Misconception.id)
    )).scalars().all()
    return [MisconceptionOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/misconceptions", response_model=MisconceptionOut, status_code=201)
async def add_misconception(
    topic_id: int,
    body: MisconceptionCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> MisconceptionOut:
    await _get_or_404(session, Topic, topic_id)
    # Validate concept_id belongs to this topic if provided
    if body.concept_id is not None:
        await _get_child_or_404(session, Concept, body.concept_id, "topic_id", topic_id,
                                 label="Concept")
    misc = Misconception(topic_id=topic_id, **body.model_dump())
    session.add(misc)
    await session.commit()
    await session.refresh(misc)
    return MisconceptionOut(**misc.serialize())


@router.patch("/topics/{topic_id}/misconceptions/{misc_id}", response_model=MisconceptionOut)
async def update_misconception(
    topic_id: int,
    misc_id: int,
    body: MisconceptionUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> MisconceptionOut:
    misc = await _get_child_or_404(session, Misconception, misc_id, "topic_id", topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(misc, field, value)
    await session.commit()
    await session.refresh(misc)
    return MisconceptionOut(**misc.serialize())


@router.delete("/topics/{topic_id}/misconceptions/{misc_id}", status_code=204)
async def delete_misconception(
    topic_id: int,
    misc_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    misc = await _get_child_or_404(session, Misconception, misc_id, "topic_id", topic_id)
    await session.delete(misc)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# LEARNING ACTIVITIES
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/activities", response_model=list[ActivityOut])
async def list_activities(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[ActivityOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(LearningActivity)
        .where(LearningActivity.topic_id == topic_id)
        .order_by(LearningActivity.order_index)
    )).scalars().all()
    return [ActivityOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/activities", response_model=ActivityOut, status_code=201)
async def add_activity(
    topic_id: int,
    body: ActivityCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ActivityOut:
    await _get_or_404(session, Topic, topic_id)
    # StrictModel has extra="forbid"; override it for ActivityCreate/Update
    # which allow the 'metadata' alias
    activity = LearningActivity(
        topic_id=topic_id,
        type=body.type,
        title=body.title,
        prompt=body.prompt,
        order_index=body.order_index,
        activity_metadata=body.activity_metadata,
    )
    session.add(activity)
    await session.commit()
    await session.refresh(activity)
    return ActivityOut(**activity.serialize())


@router.patch("/topics/{topic_id}/activities/{activity_id}", response_model=ActivityOut)
async def update_activity(
    topic_id: int,
    activity_id: int,
    body: ActivityUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ActivityOut:
    activity = await _get_child_or_404(session, LearningActivity, activity_id, "topic_id", topic_id)
    data = body.model_dump(exclude_unset=True)
    # map aliased field back to model attribute
    if "activity_metadata" in data:
        data["activity_metadata"] = data.pop("activity_metadata")
    for field, value in data.items():
        setattr(activity, field, value)
    await session.commit()
    await session.refresh(activity)
    return ActivityOut(**activity.serialize())


@router.delete("/topics/{topic_id}/activities/{activity_id}", status_code=204)
async def delete_activity(
    topic_id: int,
    activity_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    activity = await _get_child_or_404(session, LearningActivity, activity_id, "topic_id", topic_id)
    await session.delete(activity)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# QUESTIONS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/questions", response_model=list[QuestionOut])
async def list_questions(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[QuestionOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(Question).where(Question.topic_id == topic_id).order_by(Question.id)
    )).scalars().all()
    return [QuestionOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/questions", response_model=QuestionOut, status_code=201)
async def add_question(
    topic_id: int,
    body: QuestionCreate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> QuestionOut:
    await _get_or_404(session, Topic, topic_id)
    # Validate activity_id belongs to this topic if provided
    if body.activity_id is not None:
        await _get_child_or_404(session, LearningActivity, body.activity_id,
                                 "topic_id", topic_id, label="Activity")
    question = Question(topic_id=topic_id, **body.model_dump())
    session.add(question)
    await session.commit()
    await session.refresh(question)
    return QuestionOut(**question.serialize())


@router.patch("/topics/{topic_id}/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    topic_id: int,
    question_id: int,
    body: QuestionUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> QuestionOut:
    question = await _get_child_or_404(session, Question, question_id, "topic_id", topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    await session.commit()
    await session.refresh(question)
    return QuestionOut(**question.serialize())


@router.delete("/topics/{topic_id}/questions/{question_id}", status_code=204)
async def delete_question(
    topic_id: int,
    question_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    question = await _get_child_or_404(session, Question, question_id, "topic_id", topic_id)
    await session.delete(question)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# RESOURCES
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/topics/{topic_id}/resources", response_model=list[ResourceOut])
async def list_resources(
    topic_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> list[ResourceOut]:
    await _get_or_404(session, Topic, topic_id)
    rows = (await session.execute(
        select(Resource).where(Resource.topic_id == topic_id).order_by(Resource.id)
    )).scalars().all()
    return [ResourceOut(**r.serialize()) for r in rows]


@router.post("/topics/{topic_id}/resources", response_model=ResourceOut, status_code=201)
async def add_resource(
    topic_id: int,
    body: ResourceCreate,
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ResourceOut:
    await _get_or_404(session, Topic, topic_id)
    resource = Resource(topic_id=topic_id, created_by=admin.id, **body.model_dump())
    session.add(resource)
    await session.commit()
    await session.refresh(resource)
    return ResourceOut(**resource.serialize())


@router.patch("/topics/{topic_id}/resources/{resource_id}", response_model=ResourceOut)
async def update_resource(
    topic_id: int,
    resource_id: int,
    body: ResourceUpdate,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> ResourceOut:
    resource = await _get_child_or_404(session, Resource, resource_id, "topic_id", topic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    await session.commit()
    await session.refresh(resource)
    return ResourceOut(**resource.serialize())


@router.delete("/topics/{topic_id}/resources/{resource_id}", status_code=204)
async def delete_resource(
    topic_id: int,
    resource_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    resource = await _get_child_or_404(session, Resource, resource_id, "topic_id", topic_id)
    await session.delete(resource)
    await session.commit()


# ═════════════════════════════════════════════════════════════════════════════
# ADMIN UTILITIES — promote / demote users
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/users/{user_id}/make-admin", response_model=dict)
async def make_admin(
    user_id: int,
    _admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Promote a user to admin role. Only callable by an existing admin."""
    target = await _get_or_404(session, User, user_id, label="User")
    target.role = "admin"
    await session.commit()
    return {"id": target.id, "email": target.email, "role": target.role}


@router.post("/users/{user_id}/make-student", response_model=dict)
async def make_student(
    user_id: int,
    admin: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Demote a user back to student role. An admin cannot demote themselves."""
    if user_id == admin.id:
        raise HTTPException(400, "You cannot remove your own admin role.")
    target = await _get_or_404(session, User, user_id, label="User")
    target.role = "student"
    await session.commit()
    return {"id": target.id, "email": target.email, "role": target.role}


# ═════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ═════════════════════════════════════════════════════════════════════════════

async def _get_or_404(session: AsyncSession, model, pk: int, label: str = "") -> object:
    """Load a model by primary key or raise HTTP 404."""
    obj = (await session.execute(select(model).where(model.id == pk))).scalar_one_or_none()
    name = label or model.__tablename__.rstrip("s").replace("_", " ").capitalize()
    if obj is None:
        raise HTTPException(404, f"{name} not found.")
    return obj


async def _get_child_or_404(
    session: AsyncSession,
    model,
    pk: int,
    parent_field: str,
    parent_id: int,
    label: str = "",
) -> object:
    """Load a child model by PK *and* verify it belongs to the expected parent."""
    obj = (await session.execute(
        select(model).where(model.id == pk, getattr(model, parent_field) == parent_id)
    )).scalar_one_or_none()
    name = label or model.__tablename__.rstrip("s").replace("_", " ").capitalize()
    if obj is None:
        raise HTTPException(404, f"{name} not found for this topic.")
    return obj
