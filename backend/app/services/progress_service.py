"""Progress service: streaks, badge evaluation, certificates, and the /progress endpoint aggregate."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learn import Course, CourseEnrollment, Lesson, Tutorial, VideoProgress
from app.models.curriculum import TopicProgress
from app.models.progress import BADGE_CATALOGUE, BADGE_MAP, Certificate, EarnedBadge
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


async def record_ai_learning_progress(
    session: AsyncSession,
    *,
    user_id: int,
    topic_id: int,
    overall_score: Optional[int],
    completed_at: datetime,
) -> TopicProgress:
    """Persist AI Learning Room understanding into the existing TopicProgress row.

    This is intentionally small and idempotent: AI sessions update the existing
    topic-level understanding signal and review flag, but do not create a second
    progress store or overwrite challenge practice_score. Replaying a completed
    session can only keep the stronger understanding score and the latest study
    timestamp.
    """
    row = (
        await session.execute(
            select(TopicProgress)
            .where(
                TopicProgress.user_id == user_id,
                TopicProgress.topic_id == topic_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    score = None if overall_score is None else max(0, min(100, int(overall_score)))
    if row is None:
        row = TopicProgress(
            user_id=user_id,
            topic_id=topic_id,
            understanding_score=score,
            practice_score=None,
            sessions_completed=0,
            needs_review=bool(score is not None and score < 70),
            last_studied_at=completed_at,
        )
        session.add(row)
    else:
        if score is not None:
            row.understanding_score = max(row.understanding_score or 0, score)
            row.needs_review = bool((row.understanding_score or 0) < 70)
        row.last_studied_at = max(row.last_studied_at or completed_at, completed_at)

    return row

async def record_challenge_practice(
    session: AsyncSession,
    *,
    user_id: int,
    topic_id: int,
    accuracy: int,
    completed_at: datetime,
) -> TopicProgress:
    """Record one completed AI Quiz Battle as practice in existing topic progress.

    This is deliberately a progress-service operation, not a second progress
    system. Practice evidence can improve ``practice_score`` but never writes
    ``understanding_score`` because a battle does not measure conceptual mastery.
    ``sessions_completed`` counts completed practice sessions and is incremented
    by the caller only when a ChallengeResult is first created.
    """
    row = (
        await session.execute(
            select(TopicProgress)
            .where(
                TopicProgress.user_id == user_id,
                TopicProgress.topic_id == topic_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    accuracy = max(0, min(100, int(accuracy)))
    if row is None:
        row = TopicProgress(
            user_id=user_id,
            topic_id=topic_id,
            understanding_score=None,
            practice_score=accuracy,
            sessions_completed=1,
            needs_review=accuracy < 70,
            last_studied_at=completed_at,
        )
        session.add(row)
    else:
        row.practice_score = max(row.practice_score or 0, accuracy)
        row.sessions_completed = (row.sessions_completed or 0) + 1
        row.needs_review = bool(row.needs_review or accuracy < 70)
        row.last_studied_at = max(
            row.last_studied_at or completed_at,
            completed_at,
        )
        # Do not overwrite understanding_score: challenge results are practice
        # evidence, not a direct comprehension/mastery measurement.

    return row


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
    """Study rooms removed in V2. Always returns 0."""
    return 0


async def _count_rooms_as_teacher(session: AsyncSession, user_id: int) -> int:
    """Study rooms removed in V2. Always returns 0."""
    return 0


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
    level_info = _level_info(xp)
    level_num = level_info["levelNum"]

    newly_awarded: list[str] = []

    async def maybe_award(badge_id: str, condition: bool) -> None:
        if condition and not await _already_earned(session, user_id, badge_id):
            await _award(session, user_id, badge_id)
            newly_awarded.append(badge_id)

    # first_step — complete any learning activity (lesson or tutorial)
    await maybe_award("first_step", learn_count >= 1)

    # dedicated_learner — complete 5 learning activities
    await maybe_award("dedicated_learner", learn_count >= 5)

    # streak_3 — 3-day streak
    await maybe_award("streak_3", streak >= 3)

    # streak_7 — 7-day streak
    await maybe_award("streak_7", streak >= 7)

    # growing_learner — Scholar level (300 XP)
    await maybe_award("growing_learner", xp >= 300)

    # consistent_learner — Master level (1000 XP)
    await maybe_award("consistent_learner", xp >= 1000)

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
