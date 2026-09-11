"""Progress service: streaks, badge evaluation, certificates, and the /progress endpoint aggregate."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learn import Course, CourseEnrollment, Lesson, Tutorial, VideoProgress
from app.models.progress import BADGE_CATALOGUE, BADGE_MAP, Certificate, EarnedBadge
from app.models.room import StudyRoom
from app.models.user import User, _xp_level


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# XP / Level helpers  (mirrors user.py thresholds)
# ─────────────────────────────────────────────────────────────────────────────

_XP_LADDER = [
    (0,    "Beginner",  100),
    (100,  "Explorer",  300),
    (300,  "Scholar",   600),
    (600,  "Expert",   1000),
    (1000, "Master",   1000),   # max level — xpForNext same as threshold
]


def _level_info(xp: int) -> dict:
    """Return {levelNum, name, xpForNext} for a given XP value."""
    for i, (threshold, name, next_threshold) in enumerate(_XP_LADDER):
        next_t = _XP_LADDER[i + 1][0] if i + 1 < len(_XP_LADDER) else threshold
        if xp < next_t or i == len(_XP_LADDER) - 1:
            return {
                "levelNum": i + 1,
                "name": name,
                "xpForNext": next_t,
            }
    return {"levelNum": 1, "name": "Beginner", "xpForNext": 100}


# ─────────────────────────────────────────────────────────────────────────────
# Streak helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_streak_columns(session: AsyncSession, user_id: int) -> tuple[int, Optional[date]]:
    """
    Return (streak_days, last_activity_date) from the DB.
    We read them from raw SQL because streak columns are added via ALTER TABLE.
    """
    result = await session.execute(
        select(
            User.streak_days,        # type: ignore[attr-defined]
            User.last_activity_date, # type: ignore[attr-defined]
        ).where(User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        return 0, None
    streak = row[0] or 0
    last_date = row[1]
    if isinstance(last_date, datetime):
        last_date = last_date.date()
    return streak, last_date


async def record_activity(session: AsyncSession, user_id: int) -> int:
    """
    Record a qualifying learning activity for streak tracking.
    Returns the updated streak count.

    Rules:
    - First ever activity → streak = 1
    - Activity on same day as last → streak unchanged (idempotent)
    - Activity on next consecutive day → streak += 1
    - Activity after a gap of > 1 day → streak resets to 1
    """
    streak, last_date = await _get_streak_columns(session, user_id)
    today = _today()

    if last_date is None:
        new_streak = 1
    elif last_date == today:
        return streak          # same day — no change
    elif (today - last_date).days == 1:
        new_streak = streak + 1
    else:
        new_streak = 1         # gap > 1 day — reset

    await session.execute(
        text(
            "UPDATE users SET streak_days = :s, last_activity_date = :d WHERE id = :uid"
        ).bindparams(s=new_streak, d=today, uid=user_id)
    )
    await session.commit()
    return new_streak


# ─────────────────────────────────────────────────────────────────────────────
# Badge evaluation
# ─────────────────────────────────────────────────────────────────────────────

async def _already_earned(session: AsyncSession, user_id: int, badge_id: str) -> bool:
    row = (await session.execute(
        select(EarnedBadge).where(
            EarnedBadge.user_id == user_id,
            EarnedBadge.badge_id == badge_id,
        )
    )).scalar_one_or_none()
    return row is not None


async def _award(session: AsyncSession, user_id: int, badge_id: str) -> None:
    """Award a badge if not already earned. Silently skips duplicates."""
    if await _already_earned(session, user_id, badge_id):
        return
    session.add(EarnedBadge(user_id=user_id, badge_id=badge_id))
    # Flush without committing — caller commits
    await session.flush()


async def _count_completed_learn_activities(session: AsyncSession, user_id: int) -> int:
    """Count completed lessons + completed tutorials for this user."""
    result = await session.execute(
        select(func.count()).where(
            VideoProgress.user_id == user_id,
            VideoProgress.completed.is_(True),
        )
    )
    return result.scalar_one() or 0


async def _count_ended_rooms(session: AsyncSession, user_id: int) -> int:
    """Count all ended study rooms this user participated in (as creator or partner)."""
    from app.models.chat import Conversation
    convs = (await session.execute(
        select(Conversation.id).where(
            (Conversation.user_a_id == user_id) | (Conversation.user_b_id == user_id)
        )
    )).scalars().all()
    if not convs:
        return 0
    result = await session.execute(
        select(func.count()).where(
            StudyRoom.conversation_id.in_(convs),
            StudyRoom.ended_at.is_not(None),
        )
    )
    return result.scalar_one() or 0


async def _count_rooms_as_teacher(session: AsyncSession, user_id: int) -> int:
    """
    Count rooms where this user was in a teaching/helper role.
    Creator with creator_role='teaching', or partner when creator_role='learning'.
    """
    from app.models.chat import Conversation
    convs_map = {
        row[0]: (row[1], row[2])
        for row in (await session.execute(
            select(Conversation.id, Conversation.user_a_id, Conversation.user_b_id).where(
                (Conversation.user_a_id == user_id) | (Conversation.user_b_id == user_id)
            )
        )).all()
    }
    if not convs_map:
        return 0

    rooms = (await session.execute(
        select(StudyRoom).where(
            StudyRoom.conversation_id.in_(list(convs_map.keys())),
            StudyRoom.ended_at.is_not(None),
        )
    )).scalars().all()

    count = 0
    for room in rooms:
        is_creator = room.creator_id == user_id
        role = room.creator_role  # "teaching" | "learning" | None
        if is_creator and role == "teaching":
            count += 1
        elif not is_creator and role == "learning":
            # Partner is the teacher when creator declared "learning"
            count += 1
    return count


async def evaluate_badges(session: AsyncSession, user_id: int) -> list[str]:
    """
    Evaluate ALL badge criteria for this user and award any newly-earned badges.
    Returns list of newly-awarded badge IDs (empty if none).
    Commits the session at the end.
    """
    # Load current stats
    streak, _ = await _get_streak_columns(session, user_id)
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        return []

    xp = user.xp or 0
    learn_count = await _count_completed_learn_activities(session, user_id)
    room_count = await _count_ended_rooms(session, user_id)
    teacher_count = await _count_rooms_as_teacher(session, user_id)
    level_info = _level_info(xp)
    level_num = level_info["levelNum"]

    newly_awarded: list[str] = []

    async def maybe_award(badge_id: str, condition: bool) -> None:
        if condition and not await _already_earned(session, user_id, badge_id):
            await _award(session, user_id, badge_id)
            newly_awarded.append(badge_id)

    # first_step — complete any learning activity (lesson, tutorial, or study room)
    await maybe_award("first_step", learn_count >= 1 or room_count >= 1)

    # study_buddy — complete first study room session
    await maybe_award("study_buddy", room_count >= 1)

    # dedicated_learner — complete 5 learning activities
    await maybe_award("dedicated_learner", learn_count >= 5)

    # streak_3 — 3-day streak
    await maybe_award("streak_3", streak >= 3)

    # streak_7 — 7-day streak
    await maybe_award("streak_7", streak >= 7)

    # knowledge_sharer — helped in 5 sessions as teacher
    await maybe_award("knowledge_sharer", teacher_count >= 5)

    # peer_mentor — helped in 10 sessions as teacher
    await maybe_award("peer_mentor", teacher_count >= 10)

    # growing_learner — level 5 (300 XP threshold = Scholar level, level index 3)
    await maybe_award("growing_learner", xp >= 300)

    # consistent_learner — level 10 (1000 XP = Master level)
    await maybe_award("consistent_learner", xp >= 1000)

    # team_player — 10 collaborative study room sessions
    await maybe_award("team_player", room_count >= 10)

    if newly_awarded:
        await session.commit()

    return newly_awarded


# ─────────────────────────────────────────────────────────────────────────────
# Certificate logic
# ─────────────────────────────────────────────────────────────────────────────

async def maybe_award_certificate(
    session: AsyncSession, user_id: int, course_id: int
) -> Optional[Certificate]:
    """
    Award a certificate if this user has completed all lessons in the course.
    Idempotent — returns existing cert if already awarded.
    """
    # Check if certificate already exists
    existing = (await session.execute(
        select(Certificate).where(
            Certificate.user_id == user_id,
            Certificate.course_id == course_id,
        )
    )).scalar_one_or_none()
    if existing:
        return existing

    # Verify course completion: all lessons must be completed
    course = (await session.execute(
        select(Course).where(Course.id == course_id)
    )).scalar_one_or_none()
    if not course:
        return None

    # Must be enrolled
    enrollment = (await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.user_id == user_id,
            CourseEnrollment.course_id == course_id,
        )
    )).scalar_one_or_none()
    if not enrollment:
        return None

    # Count total lessons in course
    total_lessons = (await session.execute(
        select(func.count()).where(Lesson.course_id == course_id)
    )).scalar_one() or 0

    if total_lessons == 0:
        return None  # Course with no lessons cannot be certified

    # Count completed lessons for this user in this course
    completed_lessons = (await session.execute(
        select(func.count()).where(
            VideoProgress.user_id == user_id,
            VideoProgress.lesson_id.in_(
                select(Lesson.id).where(Lesson.course_id == course_id)
            ),
            VideoProgress.completed.is_(True),
        )
    )).scalar_one() or 0

    if completed_lessons < total_lessons:
        return None  # Not all lessons completed

    # All lessons complete — award certificate
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    cert = Certificate(
        cert_uid=str(uuid.uuid4()),
        user_id=user_id,
        course_id=course_id,
        course_name=course.title,
        student_name=user.full_name if user else "",
        subject=course.subject,
    )
    session.add(cert)

    # Also mark enrollment as completed
    enrollment.completed = True
    enrollment.completed_at = _now()

    await session.commit()
    await session.refresh(cert)
    return cert


# ─────────────────────────────────────────────────────────────────────────────
# Progress aggregate (main endpoint data)
# ─────────────────────────────────────────────────────────────────────────────

async def get_progress(session: AsyncSession, user_id: int) -> dict:
    """
    Return a single consolidated progress object for the /api/progress endpoint.
    Includes: XP/level, streak, badge count, certificates, all badges with
    earned/locked status, and all certificates.
    """
    # User base stats
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        return {}

    xp = user.xp or 0
    streak, _ = await _get_streak_columns(session, user_id)
    level_info = _level_info(xp)

    # Earned badges
    earned_rows = (await session.execute(
        select(EarnedBadge).where(EarnedBadge.user_id == user_id).order_by(EarnedBadge.earned_at)
    )).scalars().all()
    earned_ids = {b.badge_id for b in earned_rows}
    earned_map = {b.badge_id: b for b in earned_rows}

    # Build full badge list (all 10, with earned/locked status)
    all_badges = []
    for b in BADGE_CATALOGUE:
        if b["id"] in earned_ids:
            eb = earned_map[b["id"]]
            all_badges.append({
                **b,
                "earned": True,
                "earnedAt": eb.earned_at.isoformat(),
            })
        else:
            all_badges.append({**b, "earned": False, "earnedAt": None})

    # Recent 4 badges for overview tab
    recent_badges = sorted(
        [b for b in all_badges if b["earned"]],
        key=lambda b: b["earnedAt"] or "",
        reverse=True,
    )[:4]

    # Certificates
    certs = (await session.execute(
        select(Certificate).where(Certificate.user_id == user_id).order_by(Certificate.issued_at.desc())
    )).scalars().all()

    return {
        "xp": xp,
        "level": level_info["levelNum"],
        "levelName": level_info["name"],
        "xpForNext": level_info["xpForNext"],
        "dayStreak": streak,
        "badgesEarned": len(earned_ids),
        "certificatesEarned": len(certs),
        "sessionCount": user.session_count or 0,
        "allBadges": all_badges,
        "recentBadges": recent_badges,
        "certificates": [c.serialize() for c in certs],
    }
