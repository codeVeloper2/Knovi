"""Profile routes: current user, agreement acceptance, profile update, avatar."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import current_user
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, DeleteAccountRequest
from app.schemas.profile import ProfileUpdate, PrivacyUpdate
from app.services import auth_service, storage_service

router = APIRouter()


@router.get("/me")
async def get_me(user: User = Depends(current_user)) -> dict:
    return user.serialize()


@router.post("/me/agreement")
async def accept_agreement(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    updated = await auth_service.accept_agreement(session, user)
    return updated.serialize()


@router.put("/me/profile")
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    updated = await auth_service.update_profile(session, user, body.model_dump())
    return updated.serialize()


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
) -> dict:
    """Upload a profile photo to Firebase Storage and return its public URL."""
    data = await file.read()
    # The Firebase Admin SDK does blocking network I/O. Running it directly in
    # this async route would freeze the event loop for the whole upload (and on
    # Windows can stall long enough that the client drops the connection —
    # surfacing as "couldn't reach the server"). Offload it to a worker thread.
    url = await run_in_threadpool(
        storage_service.upload_avatar, user.id, data, file.content_type or ""
    )
    return {"photoURL": url}


@router.post("/me/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await auth_service.change_password(session, user, body.currentPassword, body.newPassword)
    return {"ok": True, "message": "Your password has been updated."}


@router.delete("/me")
async def delete_account(
    body: DeleteAccountRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Permanently delete the current user's account (verifies password)."""
    await auth_service.delete_account(session, user, body.password)
    return {"ok": True, "message": "Your account has been deleted."}



@router.post("/me/presence")
async def set_presence(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark the current user as online. Called on login / app load."""
    user.is_online = True
    await session.commit()
    return {"isOnline": True}


@router.delete("/me/presence")
async def clear_presence(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark the current user as offline. Called on logout / tab close."""
    user.is_online = False
    await session.commit()
    return {"isOnline": False}


@router.patch("/me/privacy")
async def update_privacy(
    body: PrivacyUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update privacy settings independently (auto-saves on toggle)."""
    user.is_public = body.isPublic
    user.allow_direct_message = body.allowDirectMessage
    await session.commit()
    await session.refresh(user)
    return user.serialize()
