"""Auth-related request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.base import StrictModel


class SignupRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    fullName: str = Field(min_length=1, max_length=120)


class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailRequest(StrictModel):
    email: EmailStr


class VerifyCodeRequest(StrictModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class ChangePasswordRequest(StrictModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=8, max_length=128)


class DeleteAccountRequest(StrictModel):
    # Optional: password accounts must supply it; Google-only accounts have none.
    password: str = Field(default="", max_length=128)


class ResetPasswordRequest(StrictModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    password: str = Field(min_length=8, max_length=128)


class GoogleLoginRequest(StrictModel):
    idToken: str  # Firebase ID token from the client after Google popup


# Response model — stays permissive (extras are fine when serializing out).
class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: dict
