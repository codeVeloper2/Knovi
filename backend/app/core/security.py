"""Security utilities: password hashing (bcrypt) and JWT tokens.

- `hash_password` / `verify_password` — salted bcrypt hashing.
- `create_access_token` — the session token the frontend sends on each request.
- `create_email_token` / `decode_email_token` — short-lived tokens embedded in
  verification and password-reset links.
- `current_user` — FastAPI dependency: decodes the bearer JWT and loads the User.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.models.user import User


# ── Password hashing ────────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── JWT tokens ──────────────────────────────────────────────────
def _encode(payload: dict, expire_minutes: int) -> str:
    to_encode = payload.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _encode({"sub": str(user_id), "type": "access"}, settings.ACCESS_TOKEN_EXPIRE_MINUTES)


def create_email_token(user_id: int, purpose: str) -> str:
    """purpose is 'verify' or 'reset'."""
    return _encode({"sub": str(user_id), "type": purpose}, settings.EMAIL_TOKEN_EXPIRE_MINUTES)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="This link or session has expired.") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or malformed token.") from exc


def decode_email_token(token: str, expected_purpose: str) -> int:
    payload = decode_token(token)
    if payload.get("type") != expected_purpose:
        raise HTTPException(status_code=400, detail="This link is not valid for this action.")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="This link is malformed.") from exc


# ── Current-user dependency ─────────────────────────────────────
async def current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in again.")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Please sign in again.")

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Please sign in again.") from exc

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Account not found. Please sign in again.")

    # Enforce verified email: a student cannot use the app until they verify.
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in. Check your inbox for the link.",
        )
    return user
