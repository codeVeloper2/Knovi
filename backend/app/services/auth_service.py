"""Auth + user data logic backed by PostgreSQL.

Handles user lookup/creation, signup, login, email verification, password
reset, and Google account linking. Route handlers stay thin and call these.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.models.user import User
from app.services import email_service, storage_service

CODE_TTL_MINUTES = 15


def _notify_activity(user: User, title: str, what: str) -> None:
    """Send a security/activity notice email. Best-effort: never fatal."""
    try:
        if not email_service.smtp_configured() or not user.email:
            return
        subject, html, text = email_service.activity_email(title, what)
        email_service.send_email(user.email, subject, html, text)
    except Exception:
        # A failed notification must never block the account change itself.
        pass


def _generate_code() -> str:
    """A 6-digit numeric verification code."""
    return f"{secrets.randbelow(1_000_000):06d}"


async def issue_verification_code(session: AsyncSession, user: User) -> str:
    """Generate, hash+store, and return a fresh 6-digit code for the user."""
    code = _generate_code()
    user.verification_code = security.hash_password(code)
    user.code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    await session.commit()
    return code


async def verify_code(session: AsyncSession, email: str, code: str) -> User:
    """Check a submitted code; on success mark verified and clear the code."""
    user = await get_by_email(session, email)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid code or email.")
    if user.email_verified:
        return user
    if not user.verification_code or not user.code_expires_at:
        raise HTTPException(status_code=400, detail="No active code. Please request a new one.")

    expires = user.code_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")

    if not security.verify_password(code.strip(), user.verification_code):
        raise HTTPException(status_code=400, detail="That code is incorrect. Please try again.")

    user.email_verified = True
    user.verification_code = None
    user.code_expires_at = None
    await session.commit()
    await session.refresh(user)
    return user


# ── Lookups ─────────────────────────────────────────────────────
async def get_by_email(session: AsyncSession, email: str) -> User | None:
    email = email.strip().lower()
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_firebase_uid(session: AsyncSession, uid: str) -> User | None:
    result = await session.execute(select(User).where(User.firebase_uid == uid))
    return result.scalar_one_or_none()


# ── Signup / login (email + password) ───────────────────────────
async def create_password_user(
    session: AsyncSession, email: str, password: str, full_name: str
) -> User:
    email = email.strip().lower()
    if await get_by_email(session, email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        email=email,
        hashed_password=security.hash_password(password),
        full_name=full_name.strip(),
        provider="password",
        email_verified=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    user = await get_by_email(session, email)
    if not user or not security.verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return user


# ── Email verification ──────────────────────────────────────────
def build_action_link(token: str, path: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}{path}?token={token}"


async def mark_verified(session: AsyncSession, user_id: int) -> User:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    user.email_verified = True
    await session.commit()
    await session.refresh(user)
    return user


# ── Password reset (by 6-digit code) ────────────────────────────
async def issue_reset_code(session: AsyncSession, user: User) -> str:
    """Generate, hash+store, and return a fresh reset code for the user."""
    code = _generate_code()
    user.reset_code = security.hash_password(code)
    user.reset_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    await session.commit()
    return code


def _check_reset_code(user: User, code: str) -> None:
    """Validate a reset code against the user; raise HTTPException if invalid."""
    if not user.reset_code or not user.reset_code_expires_at:
        raise HTTPException(status_code=400, detail="No active reset code. Please request a new one.")
    expires = user.reset_code_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")
    if not security.verify_password(code.strip(), user.reset_code):
        raise HTTPException(status_code=400, detail="That code is incorrect. Please try again.")


async def verify_reset_code(session: AsyncSession, email: str, code: str) -> User:
    """Check a reset code is valid (does not consume it)."""
    user = await get_by_email(session, email)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid code or email.")
    _check_reset_code(user, code)
    return user


async def reset_password_with_code(
    session: AsyncSession, email: str, code: str, new_password: str
) -> User:
    """Verify the reset code, then set the new password and clear the code."""
    user = await get_by_email(session, email)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid code or email.")
    _check_reset_code(user, code)
    user.hashed_password = security.hash_password(new_password)
    user.reset_code = None
    user.reset_code_expires_at = None
    await session.commit()
    await session.refresh(user)
    return user


# ── Change password (logged-in user) ────────────────────────────
async def change_password(
    session: AsyncSession, user: User, current_password: str, new_password: str
) -> User:
    if not user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="This account signs in with Google, so it has no password to change.",
        )
    if not security.verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    if security.verify_password(new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Your new password can't be the same as your current password.")
    user.hashed_password = security.hash_password(new_password)
    await session.commit()
    await session.refresh(user)
    _notify_activity(user, "Your password was changed", "your password was changed")
    return user


# ── Delete account (logged-in user) ─────────────────────────────
async def delete_account(session: AsyncSession, user: User, password: str) -> None:
    """Permanently delete the user's account and all data tied to it.

    Password accounts must confirm with their current password. Google-only
    accounts (no password set) are allowed to delete without one, since they
    have no password to verify.

    Deletes: the users row + the user's avatar files in Supabase Storage.
    FUTURE: when you add tables that reference users.id (messages, matches,
    progress, etc.), give those FKs `ondelete="CASCADE"` so deleting the user
    row auto-removes their rows here too — no extra code needed below.
    """
    if user.hashed_password:
        if not password or not security.verify_password(password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Your password is incorrect.")

    # Capture what we need before the row is gone.
    email = user.email
    name = user.full_name or ""
    user_id = user.id

    # Delete the DB row (this is the source of truth for "the account").
    await session.delete(user)
    await session.commit()

    # Delete everything else tied to the account. All best-effort and run in a
    # threadpool (blocking httpx) so cleanup never blocks or breaks the delete.
    try:
        await run_in_threadpool(storage_service.delete_user_avatars, user_id)
    except Exception:
        pass

    # Best-effort confirmation email — never fatal to the deletion.
    try:
        if email_service.smtp_configured() and email:
            subject, html, text = email_service.account_deleted_email(name)
            await run_in_threadpool(email_service.send_email, email, subject, html, text)
    except Exception:
        pass


# ── Google sign-in ──────────────────────────────────────────────
async def upsert_google_user(
    session: AsyncSession, firebase_uid: str, email: str, full_name: str, photo_url: str
) -> User:
    """Find or create the local user for a verified Google account."""
    email = email.strip().lower()
    user = await get_by_firebase_uid(session, firebase_uid)
    if user is None:
        # Link to an existing email account if one exists, else create.
        user = await get_by_email(session, email)
        if user is None:
            user = User(
                email=email,
                full_name=full_name or "",
                photo_url=photo_url or "",
                provider="google",
                firebase_uid=firebase_uid,
                email_verified=True,  # Google emails are pre-verified
            )
            session.add(user)
        else:
            user.firebase_uid = firebase_uid
            user.email_verified = True
            if not user.full_name and full_name:
                user.full_name = full_name
            if not user.photo_url and photo_url:
                user.photo_url = photo_url
        await session.commit()
        await session.refresh(user)
    return user


# ── Profile updates ─────────────────────────────────────────────
async def accept_agreement(session: AsyncSession, user: User) -> User:
    now = datetime.now(timezone.utc)
    user.agreed_to_learning_agreement = True
    if user.agreement_accepted_at is None:
        user.agreement_accepted_at = now
    await session.commit()
    await session.refresh(user)
    return user


async def update_profile(session: AsyncSession, user: User, data: dict) -> User:
    if not user.agreed_to_learning_agreement:
        raise HTTPException(
            status_code=400,
            detail="Please accept the learning agreement before finishing your profile.",
        )
    # Track identity-level changes so we can notify the student about them.
    prev_name = user.full_name
    prev_photo = user.photo_url
    was_complete = user.profile_complete

    user.full_name = data.get("displayName", user.full_name)
    user.grade = data.get("grade", user.grade)
    user.subjects_good_at = data.get("subjectsGoodAt", user.subjects_good_at)
    user.subjects_need_help = data.get("subjectsNeedHelp", user.subjects_need_help)
    user.skill_level = data.get("skillLevel", user.skill_level)
    user.language = data.get("language", user.language)
    user.bio = data.get("bio", user.bio)
    if data.get("photoURL"):
        user.photo_url = data["photoURL"]
    # Privacy fields — respect whatever the user sent (defaults preserved if not sent)
    if "isPublic" in data:
        user.is_public = bool(data["isPublic"])
    if "allowDirectMessage" in data:
        user.allow_direct_message = bool(data["allowDirectMessage"])
    user.profile_complete = True
    await session.commit()
    await session.refresh(user)

    # Only notify on meaningful identity changes to an already-set-up profile
    # (avoids emailing on the very first onboarding save or minor bio edits).
    if was_complete:
        if user.full_name != prev_name:
            _notify_activity(user, "Your display name was changed", "your display name was updated")
        elif user.photo_url != prev_photo:
            _notify_activity(user, "Your profile photo was changed", "your profile photo was updated")

    return user
