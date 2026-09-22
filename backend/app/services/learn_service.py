"""Learn section — business logic."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.learn import (
    Course, CourseEnrollment, LearnComment, Lesson,
    SavedContent, Tutorial, VideoProgress,
)
from app.models.user import User
from app.models.ai_learning import AISessionMessage, AILearningSession
from app.models.curriculum import Subject, Topic, Concept


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Helpers ───────────────────────────────────────────────────────────────

async def _get_progress_map(
    session: AsyncSession, user_id: int,
    lesson_ids: list[int] = (), tutorial_ids: list[int] = ()
) -> dict[str, VideoProgress]:
    """Return a dict keyed by 'lesson:{id}' or 'tutorial:{id}'."""
    rows: list[VideoProgress] = []
    if lesson_ids:
        result = await session.execute(
            select(VideoProgress).where(
                VideoProgress.user_id == user_id,
                VideoProgress.lesson_id.in_(lesson_ids),
            )
        )
        rows += list(result.scalars().all())
    if tutorial_ids:
        result = await session.execute(
            select(VideoProgress).where(
                VideoProgress.user_id == user_id,
                VideoProgress.tutorial_id.in_(tutorial_ids),
            )
        )
        rows += list(result.scalars().all())
    out = {}
    for r in rows:
        if r.lesson_id:
            out[f"lesson:{r.lesson_id}"] = r
        if r.tutorial_id:
            out[f"tutorial:{r.tutorial_id}"] = r
    return out


async def _enrollment(session: AsyncSession, user_id: int, course_id: int) -> Optional[CourseEnrollment]:
    return (await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.user_id == user_id,
            CourseEnrollment.course_id == course_id,
        )
    )).scalar_one_or_none()


async def _course_progress_pct(
    session: AsyncSession, user_id: int, course: Course
) -> int:
    if not course.lessons:
        return 0
    lesson_ids = [l.id for l in course.lessons]
    completed = (await session.execute(
        select(func.count()).where(
            VideoProgress.user_id == user_id,
            VideoProgress.lesson_id.in_(lesson_ids),
            VideoProgress.completed.is_(True),
        )
    )).scalar_one()
    return int(completed / len(lesson_ids) * 100)


# ── Courses ───────────────────────────────────────────────────────────────

async def list_courses(
    session: AsyncSession,
    user_id: int,
    subject: Optional[str] = None,
    only_enrolled: bool = False,
    only_saved: bool = False,
    search: Optional[str] = None,
) -> list[dict]:
    q = select(Course).options(selectinload(Course.lessons)).where(Course.is_published.is_(True))
    if subject and subject != "All":
        q = q.where(Course.subject == subject)
    if search:
        term = f"%{search}%"
        q = q.where(or_(Course.title.ilike(term), Course.description.ilike(term), Course.subject.ilike(term)))
    if only_enrolled:
        enrolled_ids = (await session.execute(
            select(CourseEnrollment.course_id).where(CourseEnrollment.user_id == user_id)
        )).scalars().all()
        q = q.where(Course.id.in_(enrolled_ids))
    if only_saved:
        saved_ids = (await session.execute(
            select(SavedContent.content_id).where(
                SavedContent.user_id == user_id,
                SavedContent.content_type == "course",
            )
        )).scalars().all()
        q = q.where(Course.id.in_(saved_ids))

    q = q.order_by(desc(Course.rating), desc(Course.created_at))
    courses = (await session.execute(q)).scalars().unique().all()

    # Bulk fetch enrollments for this user
    enrolled_set = set(
        (await session.execute(
            select(CourseEnrollment.course_id).where(
                CourseEnrollment.user_id == user_id,
                CourseEnrollment.course_id.in_([c.id for c in courses]),
            )
        )).scalars().all()
    )

    result = []
    for c in courses:
        pct = await _course_progress_pct(session, user_id, c) if c.id in enrolled_set else 0
        result.append(c.serialize(enrolled=c.id in enrolled_set, progress_pct=pct))
    return result


async def get_course(session: AsyncSession, course_id: int, user_id: int) -> dict:
    course = (await session.execute(
        select(Course).options(selectinload(Course.lessons))
        .where(Course.id == course_id, Course.is_published.is_(True))
    )).scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found.")

    enroll = await _enrollment(session, user_id, course_id)
    pct = await _course_progress_pct(session, user_id, course) if enroll else 0

    # Attach per-lesson progress
    prog_map = await _get_progress_map(session, user_id, lesson_ids=[l.id for l in course.lessons])
    lessons = [l.serialize(prog_map.get(f"lesson:{l.id}")) for l in course.lessons]

    data = course.serialize(enrolled=bool(enroll), progress_pct=pct)
    data["lessons"] = lessons
    return data


async def enroll_course(session: AsyncSession, course_id: int, user_id: int) -> dict:
    course = (await session.execute(
        select(Course).options(selectinload(Course.lessons)).where(Course.id == course_id)
    )).scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found.")
    existing = await _enrollment(session, user_id, course_id)
    if not existing:
        session.add(CourseEnrollment(user_id=user_id, course_id=course_id))
        await session.commit()
    return await get_course(session, course_id, user_id)


# ── Video Progress ─────────────────────────────────────────────────────────

async def update_video_progress(
    session: AsyncSession,
    user_id: int,
    lesson_id: Optional[int],
    tutorial_id: Optional[int],
    position_seconds: int,
    duration_seconds: int,
) -> VideoProgress:
    if lesson_id is None and tutorial_id is None:
        raise HTTPException(400, "Provide lesson_id or tutorial_id.")

    q = select(VideoProgress).where(VideoProgress.user_id == user_id)
    if lesson_id:
        q = q.where(VideoProgress.lesson_id == lesson_id)
    else:
        q = q.where(VideoProgress.tutorial_id == tutorial_id)

    prog = (await session.execute(q)).scalar_one_or_none()
    pct = min(100, int(position_seconds / max(duration_seconds, 1) * 100)) if duration_seconds else 0
    completed = pct >= 90

    if prog:
        was_already_completed = prog.completed
        prog.position_seconds = position_seconds
        prog.percentage = pct
        prog.completed = completed
        prog.last_watched_at = _now()
    else:
        was_already_completed = False
        prog = VideoProgress(
            user_id=user_id,
            lesson_id=lesson_id,
            tutorial_id=tutorial_id,
            position_seconds=position_seconds,
            percentage=pct,
            completed=completed,
        )
        session.add(prog)

    await session.commit()
    await session.refresh(prog)

    # ── Trigger streak + badge evaluation when a lesson/tutorial is completed ──
    if completed and not was_already_completed:
        from app.services import progress_service
        await progress_service.record_activity(session, user_id)
        await progress_service.evaluate_badges(session, user_id)
        # Check if this lesson's course is now fully complete → certificate
        if lesson_id:
            lesson = (await session.execute(
                select(Lesson).where(Lesson.id == lesson_id)
            )).scalar_one_or_none()
            if lesson:
                await progress_service.maybe_award_certificate(session, user_id, lesson.course_id)

    return prog


# ── Tutorials ─────────────────────────────────────────────────────────────

async def list_tutorials(
    session: AsyncSession,
    user_id: int,
    subject: Optional[str] = None,
    sort: str = "popular",
    only_mine: bool = False,
    search: Optional[str] = None,
) -> list[dict]:
    q = select(Tutorial).where(Tutorial.status == "approved")
    if only_mine:
        q = select(Tutorial).where(Tutorial.creator_id == user_id)
    if subject and subject != "All":
        q = q.where(Tutorial.subject == subject)
    if search:
        term = f"%{search}%"
        q = q.where(or_(Tutorial.title.ilike(term), Tutorial.topic.ilike(term), Tutorial.subject.ilike(term)))
    if sort == "recent":
        q = q.order_by(desc(Tutorial.created_at))
    else:
        q = q.order_by(desc(Tutorial.views), desc(Tutorial.rating))

    tuts = (await session.execute(q)).scalars().all()
    prog_map = await _get_progress_map(session, user_id, tutorial_ids=[t.id for t in tuts])
    return [t.serialize(prog_map.get(f"tutorial:{t.id}")) for t in tuts]


async def get_tutorial(session: AsyncSession, tutorial_id: int, user_id: int) -> dict:
    tut = (await session.execute(
        select(Tutorial).where(Tutorial.id == tutorial_id)
    )).scalar_one_or_none()
    if not tut:
        raise HTTPException(404, "Tutorial not found.")
    # Increment view count
    tut.views = (tut.views or 0) + 1
    await session.commit()
    prog_map = await _get_progress_map(session, user_id, tutorial_ids=[tut.id])
    return tut.serialize(prog_map.get(f"tutorial:{tut.id}"))


async def create_tutorial(
    session: AsyncSession,
    creator_id: int,
    title: str,
    subject: str,
    topic: str,
    description: str,
    video_url: str,
    thumbnail_url: str,
) -> Tutorial:
    user = (await session.execute(select(User).where(User.id == creator_id))).scalar_one_or_none()
    tut = Tutorial(
        creator_id=creator_id,
        creator_name=user.full_name if user else "",
        creator_photo=user.photo_url if user else "",
        title=title,
        subject=subject,
        topic=topic,
        description=description,
        video_url=video_url,
        thumbnail_url=thumbnail_url,
        status="approved",  # auto-approved — add manual moderation later if needed
    )
    session.add(tut)
    await session.commit()
    await session.refresh(tut)
    return tut


# ── Saved Content ──────────────────────────────────────────────────────────

async def toggle_saved(
    session: AsyncSession, user_id: int, content_type: str, content_id: int
) -> dict:
    allowed = {"course", "tutorial", "lesson", "explanation"}
    if content_type not in allowed:
        raise HTTPException(400, "Unsupported saved resource type.")

    if content_type == "explanation":
        message = (await session.execute(
            select(AISessionMessage).join(AILearningSession, AISessionMessage.session_id == AILearningSession.id).where(
                AISessionMessage.id == content_id,
                AILearningSession.user_id == user_id,
                AISessionMessage.role == "ai",
            )
        )).scalar_one_or_none()
        if not message:
            raise HTTPException(404, "AI explanation not found.")
        if message.message_type in {"system", "welcome", "timer_start", "timer_end", "summary"}:
            raise HTTPException(400, "This tutor message cannot be saved as an explanation.")

    existing = (await session.execute(
        select(SavedContent).where(
            SavedContent.user_id == user_id,
            SavedContent.content_type == content_type,
            SavedContent.content_id == content_id,
        )
    )).scalar_one_or_none()

    if existing:
        await session.delete(existing)
        await session.commit()
        return {"saved": False, "contentType": content_type, "contentId": content_id}

    session.add(SavedContent(user_id=user_id, content_type=content_type, content_id=content_id))
    await session.commit()
    return {"saved": True, "contentType": content_type, "contentId": content_id}


async def _serialize_saved_explanation(
    session: AsyncSession, saved_row: SavedContent
) -> Optional[dict]:
    message = (await session.execute(
        select(AISessionMessage).where(AISessionMessage.id == saved_row.content_id)
    )).scalar_one_or_none()
    if not message:
        return None

    learning_session = (await session.execute(
        select(AILearningSession).where(AILearningSession.id == message.session_id)
    )).scalar_one_or_none()
    if not learning_session:
        return None

    subject = (await session.execute(select(Subject).where(Subject.id == learning_session.subject_id))).scalar_one_or_none()
    topic = (await session.execute(select(Topic).where(Topic.id == learning_session.topic_id))).scalar_one_or_none()
    concept = (await session.execute(select(Concept).where(Concept.id == learning_session.concept_id))).scalar_one_or_none()
    extra = message.extra or {}
    task_title = extra.get("taskTitle") or extra.get("taskName") or extra.get("task")

    return {
        "id": saved_row.id,
        "messageId": message.id,
        "sessionId": message.session_id,
        "contentType": "explanation",
        "title": task_title or (concept.name if concept else "Saved tutor explanation"),
        "content": message.content,
        "subject": subject.name if subject else "",
        "classLevel": subject.class_level if subject else "",
        "topic": topic.name if topic else "",
        "concept": concept.name if concept else "",
        "taskIndex": extra.get("taskIndex"),
        "savedAt": saved_row.saved_at.isoformat(),
        "createdAt": message.created_at.isoformat(),
    }


async def get_saved_content(session: AsyncSession, user_id: int) -> dict:
    rows = (await session.execute(
        select(SavedContent).where(SavedContent.user_id == user_id).order_by(desc(SavedContent.saved_at))
    )).scalars().all()

    saved_course_ids  = [r.content_id for r in rows if r.content_type == "course"]
    saved_tutorial_ids= [r.content_id for r in rows if r.content_type == "tutorial"]
    saved_lesson_ids  = [r.content_id for r in rows if r.content_type == "lesson"]

    courses   = (await session.execute(
        select(Course).options(selectinload(Course.lessons)).where(Course.id.in_(saved_course_ids))
    )).scalars().all()
    tutorials = (await session.execute(select(Tutorial).where(Tutorial.id.in_(saved_tutorial_ids)))).scalars().all()
    lessons   = (await session.execute(select(Lesson).where(Lesson.id.in_(saved_lesson_ids)))).scalars().all()

    prog_c = {c.id: await _course_progress_pct(session, user_id, c) for c in courses}
    prog_t_map = await _get_progress_map(session, user_id, tutorial_ids=[t.id for t in tutorials])
    prog_l_map = await _get_progress_map(session, user_id, lesson_ids=[l.id for l in lessons])

    enrolled_set = set(
        (await session.execute(
            select(CourseEnrollment.course_id).where(
                CourseEnrollment.user_id == user_id,
                CourseEnrollment.course_id.in_(saved_course_ids),
            )
        )).scalars().all()
    )

    explanation_rows = [r for r in rows if r.content_type == "explanation"]
    explanations = []
    for row in explanation_rows:
        item = await _serialize_saved_explanation(session, row)
        if item:
            explanations.append(item)

    return {
        "courses":      [c.serialize(enrolled=c.id in enrolled_set, progress_pct=prog_c.get(c.id, 0)) for c in courses],
        "tutorials":    [t.serialize(prog_t_map.get(f"tutorial:{t.id}")) for t in tutorials],
        "lessons":      [l.serialize(prog_l_map.get(f"lesson:{l.id}")) for l in lessons],
        "explanations": explanations,
    }


async def is_saved(session: AsyncSession, user_id: int, content_type: str, content_id: int) -> bool:
    r = (await session.execute(
        select(SavedContent).where(
            SavedContent.user_id == user_id,
            SavedContent.content_type == content_type,
            SavedContent.content_id == content_id,
        )
    )).scalar_one_or_none()
    return r is not None


# ── Comments ──────────────────────────────────────────────────────────────

async def list_comments(session: AsyncSession, content_type: str, content_id: int) -> list[dict]:
    rows = (await session.execute(
        select(LearnComment)
        .options(selectinload(LearnComment.replies))
        .where(
            LearnComment.content_type == content_type,
            LearnComment.content_id == content_id,
            LearnComment.parent_id.is_(None),
        ).order_by(desc(LearnComment.created_at))
    )).scalars().unique().all()
    return [r.serialize() for r in rows]


async def add_comment(
    session: AsyncSession,
    user_id: int,
    content_type: str,
    content_id: int,
    body: str,
    parent_id: Optional[int],
) -> LearnComment:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    c = LearnComment(
        user_id=user_id,
        author_name=user.full_name if user else "",
        author_photo=user.photo_url if user else "",
        content_type=content_type,
        content_id=content_id,
        body=body.strip(),
        parent_id=parent_id,
    )
    session.add(c)
    await session.commit()
    # Re-fetch with replies eagerly loaded so serialize() works
    c = (await session.execute(
        select(LearnComment)
        .options(selectinload(LearnComment.replies))
        .where(LearnComment.id == c.id)
    )).scalar_one()
    return c


async def like_comment(session: AsyncSession, comment_id: int, user_id: int) -> int:
    c = (await session.execute(select(LearnComment).where(LearnComment.id == comment_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Comment not found.")
    c.likes = (c.likes or 0) + 1
    await session.commit()
    return c.likes


# ── My Learning ───────────────────────────────────────────────────────────

async def get_my_learning(session: AsyncSession, user_id: int) -> dict:
    """Return in-progress courses, completed courses, recent watch history."""
    enrollments = (await session.execute(
        select(CourseEnrollment).where(CourseEnrollment.user_id == user_id)
        .order_by(desc(CourseEnrollment.enrolled_at))
    )).scalars().all()

    course_ids = [e.course_id for e in enrollments]
    courses = (await session.execute(
        select(Course).options(selectinload(Course.lessons)).where(Course.id.in_(course_ids))
    )).scalars().unique().all()
    course_map = {c.id: c for c in courses}

    in_progress = []
    completed_courses = []
    for e in enrollments:
        c = course_map.get(e.course_id)
        if not c:
            continue
        pct = await _course_progress_pct(session, user_id, c)
        data = c.serialize(enrolled=True, progress_pct=pct)
        if pct >= 100 or e.completed:
            completed_courses.append(data)
        else:
            in_progress.append(data)

    # Recent video progress (lessons + tutorials) sorted by last watched
    recent_prog = (await session.execute(
        select(VideoProgress).where(VideoProgress.user_id == user_id)
        .order_by(desc(VideoProgress.last_watched_at))
        .limit(20)
    )).scalars().all()

    # Resolve titles for history
    history = []
    for p in recent_prog:
        if p.lesson_id:
            lesson = (await session.execute(select(Lesson).where(Lesson.id == p.lesson_id))).scalar_one_or_none()
            if lesson:
                history.append({
                    "type": "lesson",
                    "id": lesson.id,
                    "courseId": lesson.course_id,
                    "title": lesson.title,
                    "thumbnailUrl": lesson.thumbnail_url,
                    "durationSeconds": lesson.duration_seconds,
                    "positionSeconds": p.position_seconds,
                    "percentage": p.percentage,
                    "completed": p.completed,
                    "lastWatchedAt": p.last_watched_at.isoformat(),
                })
        elif p.tutorial_id:
            tut = (await session.execute(select(Tutorial).where(Tutorial.id == p.tutorial_id))).scalar_one_or_none()
            if tut:
                history.append({
                    "type": "tutorial",
                    "id": tut.id,
                    "title": tut.title,
                    "subject": tut.subject,
                    "thumbnailUrl": tut.thumbnail_url,
                    "durationSeconds": tut.duration_seconds,
                    "positionSeconds": p.position_seconds,
                    "percentage": p.percentage,
                    "completed": p.completed,
                    "lastWatchedAt": p.last_watched_at.isoformat(),
                })

    return {
        "inProgress": in_progress,
        "completed": completed_courses,
        "history": history,
    }


# ── Home feed ─────────────────────────────────────────────────────────────

async def get_home_feed(session: AsyncSession, user_id: int, subjects_need_help: list[str]) -> dict:
    """Assemble data for the Learn home page."""
    # Continue watching: recent unwatched/in-progress lessons & tutorials
    recent_prog = (await session.execute(
        select(VideoProgress).where(
            VideoProgress.user_id == user_id,
            VideoProgress.completed.is_(False),
            VideoProgress.percentage > 0,
        ).order_by(desc(VideoProgress.last_watched_at)).limit(6)
    )).scalars().all()

    continue_watching = []
    for p in recent_prog:
        if p.lesson_id:
            lesson = (await session.execute(select(Lesson).where(Lesson.id == p.lesson_id))).scalar_one_or_none()
            if lesson:
                continue_watching.append({
                    "type": "lesson", "id": lesson.id, "courseId": lesson.course_id,
                    "title": lesson.title, "thumbnailUrl": lesson.thumbnail_url,
                    "durationSeconds": lesson.duration_seconds,
                    "percentage": p.percentage, "positionSeconds": p.position_seconds,
                })
        elif p.tutorial_id:
            tut = (await session.execute(select(Tutorial).where(Tutorial.id == p.tutorial_id))).scalar_one_or_none()
            if tut:
                continue_watching.append({
                    "type": "tutorial", "id": tut.id,
                    "title": tut.title, "subject": tut.subject,
                    "thumbnailUrl": tut.thumbnail_url,
                    "durationSeconds": tut.duration_seconds,
                    "percentage": p.percentage, "positionSeconds": p.position_seconds,
                })

    # Recommended: courses in subjects user needs help with
    rec_q = select(Course).options(selectinload(Course.lessons)).where(Course.is_published.is_(True))
    if subjects_need_help:
        rec_q = rec_q.where(Course.subject.in_(subjects_need_help))
    recommended_courses = (await session.execute(
        rec_q.order_by(desc(Course.rating)).limit(6)
    )).scalars().unique().all()

    # Popular courses overall
    popular_courses = (await session.execute(
        select(Course).options(selectinload(Course.lessons))
        .where(Course.is_published.is_(True))
        .order_by(desc(Course.rating), desc(Course.rating_count))
        .limit(8)
    )).scalars().unique().all()

    # Latest approved tutorials
    latest_tutorials = (await session.execute(
        select(Tutorial).where(Tutorial.status == "approved")
        .order_by(desc(Tutorial.created_at))
        .limit(8)
    )).scalars().all()

    prog_map = await _get_progress_map(session, user_id, tutorial_ids=[t.id for t in latest_tutorials])

    enrolled_set = set(
        (await session.execute(
            select(CourseEnrollment.course_id).where(CourseEnrollment.user_id == user_id)
        )).scalars().all()
    )

    return {
        "continueWatching": continue_watching,
        "recommended": [c.serialize(enrolled=c.id in enrolled_set) for c in recommended_courses],
        "popular": [c.serialize(enrolled=c.id in enrolled_set) for c in popular_courses],
        "latestTutorials": [t.serialize(prog_map.get(f"tutorial:{t.id}")) for t in latest_tutorials],
    }
