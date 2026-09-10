"""Auth routes: signup, login, email verification, password reset, Google.

Email/password auth is owned by this backend (bcrypt + JWT + Postgres).
Firebase is used only to verify Google sign-in tokens.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import FIREBASE_ERROR, FIREBASE_READY
from app.core.database import get_session
from app.schemas.auth import (
    EmailRequest,
    GoogleLoginRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerifyCodeRequest,
)
from app.services import auth_service, email_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


async def _send_verification_code(session, user) -> dict | None:
    """Generate + email a 6-digit code. Returns dev payload if no SMTP."""
    code = await auth_service.issue_verification_code(session, user)
    if email_service.smtp_configured():
        subject, html, text = email_service.verification_code_email(code)
        email_service.send_email(user.email, subject, html, text)
        return None
    # No SMTP — return the code so development still works.
    return {"devCode": code, "note": "SMTP not configured; code returned for development."}


@router.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "firebase": FIREBASE_READY,
        "smtp": email_service.smtp_configured(),
        "error": bool(FIREBASE_ERROR),  # never leak internal error messages
    }


@router.post("/auth/signup")
@limiter.limit("3/hour")
async def signup(request: Request, body: SignupRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = await auth_service.create_password_user(session, body.email, body.password, body.fullName)
    dev = await _send_verification_code(session, user)
    return {
        "ok": True,
        "message": "Account created. We sent a 6-digit verification code to your email.",
        "email": user.email,
        **(dev or {}),
    }


@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = await auth_service.authenticate(session, body.email, body.password)
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in. Check your inbox for the code.",
        )
    token = security.create_access_token(user.id)
    return {"accessToken": token, "tokenType": "bearer", "user": user.serialize()}


@router.post("/auth/verify-email")
@limiter.limit("20/minute")
async def verify_email(request: Request, body: VerifyCodeRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = await auth_service.verify_code(session, body.email, body.code)
    access = security.create_access_token(user.id)
    return {"ok": True, "accessToken": access, "tokenType": "bearer", "user": user.serialize()}


@router.post("/auth/resend-verification")
@limiter.limit("5/minute")
async def resend_verification(request: Request, body: EmailRequest, session: AsyncSession = Depends(get_session)) -> dict:
    generic = {"ok": True, "message": "If that account needs verifying, a new code is on the way."}
    user = await auth_service.get_by_email(session, body.email)
    if user is None or user.email_verified:
        return generic
    dev = await _send_verification_code(session, user)
    return {**generic, **(dev or {})}


@router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: EmailRequest, session: AsyncSession = Depends(get_session)) -> dict:
    """Send a 6-digit reset code. Always returns success (no account enumeration)."""
    generic = {"ok": True, "message": "If an account exists for that email, a reset code is on the way."}
    user = await auth_service.get_by_email(session, body.email)
    if user is None:
        return generic  # don't reveal whether the account exists
    code = await auth_service.issue_reset_code(session, user)
    if email_service.smtp_configured():
        subject, html, text = email_service.reset_code_email(code)
        email_service.send_email(user.email, subject, html, text)
        return generic
    return {**generic, "devCode": code, "note": "SMTP not configured; code returned for development."}


@router.post("/auth/verify-reset-code")
@limiter.limit("20/minute")
async def verify_reset_code(request: Request, body: VerifyCodeRequest, session: AsyncSession = Depends(get_session)) -> dict:
    """Check the reset code is valid before showing the new-password step."""
    await auth_service.verify_reset_code(session, body.email, body.code)
    return {"ok": True}


@router.post("/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: ResetPasswordRequest, session: AsyncSession = Depends(get_session)) -> dict:
    await auth_service.reset_password_with_code(session, body.email, body.code, body.password)
    return {"ok": True, "message": "Your password has been reset. You can now sign in."}


@router.post("/auth/google")
@limiter.limit("10/minute")
async def google_login(request: Request, body: GoogleLoginRequest, session: AsyncSession = Depends(get_session)) -> dict:
    if not FIREBASE_READY:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured on the server.")
    # Import here so the module loads even when Firebase isn't set up.
    from firebase_admin import auth as fb_auth

    try:
        decoded = fb_auth.verify_id_token(body.idToken)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.") from exc

    email = decoded.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email.")

    user = await auth_service.upsert_google_user(
        session,
        firebase_uid=decoded["uid"],
        email=email,
        full_name=decoded.get("name", ""),
        photo_url=decoded.get("picture", ""),
    )
    token = security.create_access_token(user.id)
    return {"accessToken": token, "tokenType": "bearer", "user": user.serialize()}
