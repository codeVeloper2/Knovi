"""Learn section ORM models.

Tables:
  courses          — structured collections of lessons (Knovi-curated or creator-made)
  lessons          — individual video lessons inside a course
  tutorials        — standalone student-uploaded educational videos
  video_progress   — per-user playback position for lessons & tutorials
  course_enrollments — tracks which user started which course
  saved_content    — bookmarked courses / tutorials / lessons
  learn_comments   — discussion threads on lessons and tutorials
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Course ────────────────────────────────────────────────────────────────

class Course(Base):
    __tablename__ = "learn_courses"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    title:        Mapped[str]      = mapped_column(String(200), nullable=False)
    description:  Mapped[str]      = mapped_column(Text, default="")
    subject:      Mapped[str]      = mapped_column(String(80), nullable=False, index=True)
    thumbnail_url:Mapped[str]      = mapped_column(String(500), default="")
    creator_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_name: Mapped[str]      = mapped_column(String(120), default="Knovi")
    is_official:  Mapped[bool]     = mapped_column(Boolean, default=True)   # False = student-created course
    rating:       Mapped[float]    = mapped_column(Float, default=0.0)
    rating_count: Mapped[int]      = mapped_column(Integer, default=0)
    is_published: Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    lessons:      Mapped[list["Lesson"]] = relationship("Lesson", back_populates="course", cascade="all, delete-orphan", order_by="Lesson.order")

    @property
    def lessons_count(self) -> int:
        return len(self.lessons)

    @property
    def total_duration_minutes(self) -> int:
        return sum(l.duration_seconds // 60 for l in self.lessons)

    def serialize(self, enrolled: bool = False, progress_pct: int = 0) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "subject": self.subject,
            "thumbnailUrl": self.thumbnail_url,
            "creatorId": self.creator_id,
            "creatorName": self.creator_name,
            "isOfficial": self.is_official,
            "rating": round(self.rating, 1),
            "ratingCount": self.rating_count,
            "lessonsCount": self.lessons_count,
            "durationMinutes": self.total_duration_minutes,
            "isPublished": self.is_published,
            "enrolled": enrolled,
            "progressPct": progress_pct,
            "createdAt": self.created_at.isoformat(),
        }


# ── Lesson ────────────────────────────────────────────────────────────────

class Lesson(Base):
    __tablename__ = "learn_lessons"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("learn_courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title:        Mapped[str]      = mapped_column(String(200), nullable=False)
    description:  Mapped[str]      = mapped_column(Text, default="")
    video_url:    Mapped[str]      = mapped_column(String(500), default="")
    thumbnail_url:Mapped[str]      = mapped_column(String(500), default="")
    duration_seconds: Mapped[int]  = mapped_column(Integer, default=0)
    order:        Mapped[int]      = mapped_column(Integer, default=0)
    is_free:      Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    course:       Mapped["Course"] = relationship("Course", back_populates="lessons")

    def serialize(self, progress: Optional["VideoProgress"] = None) -> dict:
        return {
            "id": self.id,
            "courseId": self.course_id,
            "title": self.title,
            "description": self.description,
            "videoUrl": self.video_url,
            "thumbnailUrl": self.thumbnail_url,
            "durationSeconds": self.duration_seconds,
            "order": self.order,
            "isFree": self.is_free,
            "completed": progress.completed if progress else False,
            "progressPct": progress.percentage if progress else 0,
            "positionSeconds": progress.position_seconds if progress else 0,
        }


# ── Tutorial (student-created standalone video) ───────────────────────────

class Tutorial(Base):
    __tablename__ = "learn_tutorials"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    creator_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_name: Mapped[str]      = mapped_column(String(120), default="")
    creator_photo:Mapped[str]      = mapped_column(String(500), default="")
    title:        Mapped[str]      = mapped_column(String(200), nullable=False)
    subject:      Mapped[str]      = mapped_column(String(80), nullable=False, index=True)
    topic:        Mapped[str]      = mapped_column(String(120), default="")
    description:  Mapped[str]      = mapped_column(Text, default="")
    video_url:    Mapped[str]      = mapped_column(String(500), default="")
    thumbnail_url:Mapped[str]      = mapped_column(String(500), default="")
    duration_seconds: Mapped[int]  = mapped_column(Integer, default=0)
    views:        Mapped[int]      = mapped_column(Integer, default=0)
    rating:       Mapped[float]    = mapped_column(Float, default=0.0)
    rating_count: Mapped[int]      = mapped_column(Integer, default=0)
    # Moderation flow: pending → approved | rejected
    status:       Mapped[str]      = mapped_column(String(20), default="pending", index=True)
    rejection_reason: Mapped[str]  = mapped_column(Text, default="")
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    def serialize(self, progress: Optional["VideoProgress"] = None) -> dict:
        return {
            "id": self.id,
            "creatorId": self.creator_id,
            "creatorName": self.creator_name,
            "creatorPhoto": self.creator_photo,
            "title": self.title,
            "subject": self.subject,
            "topic": self.topic,
            "description": self.description,
            "videoUrl": self.video_url,
            "thumbnailUrl": self.thumbnail_url,
            "durationSeconds": self.duration_seconds,
            "views": self.views,
            "rating": round(self.rating, 1),
            "ratingCount": self.rating_count,
            "status": self.status,
            "completed": progress.completed if progress else False,
            "progressPct": progress.percentage if progress else 0,
            "positionSeconds": progress.position_seconds if progress else 0,
            "createdAt": self.created_at.isoformat(),
        }


# ── Video Progress ─────────────────────────────────────────────────────────

class VideoProgress(Base):
    """Tracks a user's playback position in a lesson or tutorial."""
    __tablename__ = "learn_video_progress"

    id:               Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:          Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Exactly one of these is non-null
    lesson_id:        Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("learn_lessons.id", ondelete="CASCADE"), nullable=True, index=True)
    tutorial_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("learn_tutorials.id", ondelete="CASCADE"), nullable=True, index=True)
    position_seconds: Mapped[int]      = mapped_column(Integer, default=0)
    percentage:       Mapped[int]      = mapped_column(Integer, default=0)   # 0-100
    completed:        Mapped[bool]     = mapped_column(Boolean, default=False)
    last_watched_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "lessonId": self.lesson_id,
            "tutorialId": self.tutorial_id,
            "positionSeconds": self.position_seconds,
            "percentage": self.percentage,
            "completed": self.completed,
            "lastWatchedAt": self.last_watched_at.isoformat(),
        }


# ── Course Enrollment ──────────────────────────────────────────────────────

class CourseEnrollment(Base):
    __tablename__ = "learn_course_enrollments"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:      Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("learn_courses.id", ondelete="CASCADE"), nullable=False, index=True)
    enrolled_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    completed:    Mapped[bool]     = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Saved Content ──────────────────────────────────────────────────────────

class SavedContent(Base):
    __tablename__ = "learn_saved"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:     Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content_type:Mapped[str]      = mapped_column(String(20), nullable=False)  # "course"|"tutorial"|"lesson"
    content_id:  Mapped[int]      = mapped_column(Integer, nullable=False)
    saved_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "contentType": self.content_type,
            "contentId": self.content_id,
            "savedAt": self.saved_at.isoformat(),
        }


# ── Learn Comment ──────────────────────────────────────────────────────────

class LearnComment(Base):
    __tablename__ = "learn_comments"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:     Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    author_name: Mapped[str]      = mapped_column(String(120), default="")
    author_photo:Mapped[str]      = mapped_column(String(500), default="")
    content_type:Mapped[str]      = mapped_column(String(20), nullable=False)  # "lesson"|"tutorial"
    content_id:  Mapped[int]      = mapped_column(Integer, nullable=False, index=True)
    parent_id:   Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("learn_comments.id", ondelete="CASCADE"), nullable=True)
    body:        Mapped[str]      = mapped_column(Text, nullable=False)
    likes:       Mapped[int]      = mapped_column(Integer, default=0)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    replies:     Mapped[list["LearnComment"]] = relationship("LearnComment", cascade="all, delete-orphan")

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "authorName": self.author_name,
            "authorPhoto": self.author_photo,
            "contentType": self.content_type,
            "contentId": self.content_id,
            "parentId": self.parent_id,
            "body": self.body,
            "likes": self.likes,
            "createdAt": self.created_at.isoformat(),
            "replies": [r.serialize() for r in (self.replies or [])],
        }
