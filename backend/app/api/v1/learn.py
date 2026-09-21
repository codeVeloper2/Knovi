"""Learn section routes."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.schemas.base import StrictModel
from app.services import learn_service, storage_service

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────

class VideoProgressBody(StrictModel):
    lessonId:        Optional[int] = None
    tutorialId:      Optional[int] = None
    positionSeconds: int
    durationSeconds: int


class CommentBody(StrictModel):
    contentType: str = Field(pattern="^(lesson|tutorial)$")
    contentId:   int
    body:        str = Field(min_length=1, max_length=2000)
    parentId:    Optional[int] = None


class SaveBody(StrictModel):
    contentType: str     # "course" | "tutorial" | "lesson"
    contentId:   int


class CreateTutorialBody(StrictModel):
    title:        str
    subject:      str
    topic:        str = ""
    description:  str = ""
    videoUrl:     str = ""
    thumbnailUrl: str = ""


# ── Home feed ─────────────────────────────────────────────────────────────

@router.get("/learn/home")
async def learn_home(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    # subjects_need_help removed from User model (peer-matching system deleted).
    # Pass empty list — get_home_feed falls back to top-rated courses when empty.
    return await learn_service.get_home_feed(session, user.id, [])


# ── Courses ───────────────────────────────────────────────────────────────

@router.get("/learn/courses")
async def list_courses(
    subject:  Optional[str] = Query(None),
    enrolled: bool = Query(False),
    saved:    bool = Query(False),
    search:   Optional[str] = Query(None),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await learn_service.list_courses(
        session, user.id, subject=subject,
        only_enrolled=enrolled, only_saved=saved, search=search,
    )


@router.get("/learn/courses/{course_id}")
async def get_course(
    course_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.get_course(session, course_id, user.id)


@router.post("/learn/courses/{course_id}/enroll")
async def enroll_course(
    course_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.enroll_course(session, course_id, user.id)


# ── Video progress ────────────────────────────────────────────────────────

@router.post("/learn/progress")
async def save_progress(
    body: VideoProgressBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prog = await learn_service.update_video_progress(
        session, user.id,
        lesson_id=body.lessonId,
        tutorial_id=body.tutorialId,
        position_seconds=body.positionSeconds,
        duration_seconds=body.durationSeconds,
    )
    return prog.serialize()


# ── Tutorials ─────────────────────────────────────────────────────────────

@router.get("/learn/tutorials")
async def list_tutorials(
    subject: Optional[str] = Query(None),
    sort:    str = Query("popular"),
    mine:    bool = Query(False),
    search:  Optional[str] = Query(None),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await learn_service.list_tutorials(
        session, user.id, subject=subject, sort=sort, only_mine=mine, search=search,
    )


@router.get("/learn/tutorials/{tutorial_id}")
async def get_tutorial(
    tutorial_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.get_tutorial(session, tutorial_id, user.id)


@router.post("/learn/tutorials")
async def create_tutorial(
    body: CreateTutorialBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    tut = await learn_service.create_tutorial(
        session, user.id, body.title, body.subject, body.topic,
        body.description, body.videoUrl, body.thumbnailUrl,
    )
    return tut.serialize()


# ── Upload video / thumbnail ──────────────────────────────────────────────

ALLOWED_VIDEO = {"video/mp4", "video/webm", "video/ogg", "video/quicktime"}
ALLOWED_IMG   = {"image/jpeg", "image/png", "image/webp"}
MAX_VIDEO_MB  = 500 * 1024 * 1024   # 500 MB
MAX_IMG_MB    = 5   * 1024 * 1024   # 5 MB


@router.post("/learn/upload/video")
async def upload_tutorial_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
) -> dict:
    data = await file.read()
    ct = file.content_type or ""
    if ct not in ALLOWED_VIDEO:
        raise HTTPException(400, "Upload an MP4, WebM, OGG, or MOV video.")
    if len(data) > MAX_VIDEO_MB:
        raise HTTPException(400, "Video is too large (max 500 MB).")

    base = storage_service.settings.SUPABASE_URL
    key  = storage_service.settings.SUPABASE_SERVICE_KEY
    bucket = storage_service.settings.SUPABASE_AVATAR_BUCKET

    if not base or not key:
        raise HTTPException(503, "Storage not configured.")

    import httpx
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "mp4"
    path = f"learn/videos/{user.id}/{uuid.uuid4().hex}.{ext}"
    headers = {
        "Authorization": f"Bearer {key}", "apikey": key,
        "Content-Type": ct, "x-upsert": "true",
    }
    resp = await run_in_threadpool(
        lambda: httpx.post(f"{base}/storage/v1/object/{bucket}/{path}", content=data, headers=headers, timeout=120.0)
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Storage error: {resp.text[:200]}")
    url = f"{base}/storage/v1/object/public/{bucket}/{path}"
    return {"url": url}


@router.post("/learn/upload/thumbnail")
async def upload_tutorial_thumbnail(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
) -> dict:
    data = await file.read()
    ct = file.content_type or ""
    if ct not in ALLOWED_IMG:
        raise HTTPException(400, "Upload a JPG, PNG, or WEBP image.")
    if len(data) > MAX_IMG_MB:
        raise HTTPException(400, "Image is too large (max 5 MB).")

    url = await run_in_threadpool(
        lambda: storage_service.upload_avatar(user.id, data, ct)
    )
    return {"url": url}


# ── Saved content ─────────────────────────────────────────────────────────

@router.post("/learn/saved")
async def toggle_saved(
    body: SaveBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.toggle_saved(session, user.id, body.contentType, body.contentId)


@router.get("/learn/saved")
async def get_saved(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.get_saved_content(session, user.id)


# ── Comments ──────────────────────────────────────────────────────────────

@router.get("/learn/comments")
async def get_comments(
    contentType: str = Query(...),
    contentId:   int = Query(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list:
    return await learn_service.list_comments(session, contentType, contentId)


@router.post("/learn/comments")
async def post_comment(
    body: CommentBody,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    c = await learn_service.add_comment(
        session, user.id, body.contentType, body.contentId, body.body, body.parentId
    )
    return c.serialize()


@router.post("/learn/comments/{comment_id}/like")
async def like_comment(
    comment_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    likes = await learn_service.like_comment(session, comment_id, user.id)
    return {"likes": likes}


# ── My Learning ───────────────────────────────────────────────────────────

@router.get("/learn/my-learning")
async def my_learning(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await learn_service.get_my_learning(session, user.id)
