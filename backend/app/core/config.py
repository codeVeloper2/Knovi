"""Central configuration for PeerUP.

Holds all environment-driven settings, initializes Firebase Admin (used only
for Google sign-in verification and Storage), and normalizes the PostgreSQL
connection URL for async SQLAlchemy.
"""
from __future__ import annotations

import os
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials

load_dotenv(override=True)

# backend/app/core/config.py -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _derive_supabase_url(db_url: str) -> str:
    """Best-effort: derive the Supabase project URL from the Postgres DSN.

    A Supabase pooler DSN looks like:
      postgresql://postgres.<ref>:<pw>@aws-1-...pooler.supabase.com:6543/postgres
    The REST/Storage API lives at https://<ref>.supabase.co
    """
    if not db_url or "supabase" not in db_url:
        return ""
    # The username carries the project ref as "postgres.<ref>".
    try:
        after_scheme = db_url.split("://", 1)[1]
        userinfo = after_scheme.split("@", 1)[0]
        user = userinfo.split(":", 1)[0]
        if "." in user:
            ref = user.split(".", 1)[1]
            if ref:
                return f"https://{ref}.supabase.co"
    except Exception:  # noqa: BLE001
        pass
    return ""


def _normalize_db_url(url: str) -> str:
    """Ensure the async psycopg driver is used for SQLAlchemy.

    Supabase / Postgres URIs usually start with `postgresql://`. Async
    SQLAlchemy with psycopg3 needs: `postgresql+psycopg://`.
    """
    if not url:
        return ""
    if url.startswith("postgresql+psycopg://"):
        return url
    # Normalize any existing driver hint or bare scheme to psycopg.
    for prefix in ("postgresql+asyncpg://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    if url.startswith("postgres://"):  # some providers use this scheme
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


class Settings:
    """App settings sourced from environment variables."""

    APP_TITLE: str = "PeerUP API"

    # ── Database ──
    DATABASE_URL: str = _normalize_db_url(os.getenv("DATABASE_URL", ""))

    # ── JWT ──
    JWT_SECRET: str = os.environ["JWT_SECRET"]  # Must be set — no insecure default
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 1 day
    # Short-lived tokens embedded in email links
    EMAIL_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("EMAIL_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

    # ── Firebase (Google sign-in only now; Storage moved to Supabase) ──
    GOOGLE_APPLICATION_CREDENTIALS: str | None = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    FIREBASE_STORAGE_BUCKET: str | None = os.getenv("FIREBASE_STORAGE_BUCKET")
    SERVICE_ACCOUNT_KEY = BACKEND_ROOT / "serviceAccountKey.json"

    # ── Supabase Storage (avatar uploads) ──
    # SUPABASE_URL falls back to being derived from DATABASE_URL's project ref.
    SUPABASE_URL: str = (os.getenv("SUPABASE_URL", "").rstrip("/")
                         or _derive_supabase_url(os.getenv("DATABASE_URL", "")))
    # The service_role key (server-side only — never expose to the frontend).
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    # Name of the public bucket that holds avatars.
    SUPABASE_AVATAR_BUCKET: str = os.getenv("SUPABASE_AVATAR_BUCKET", "avatars")

    # ── Chat encryption ──
    # AES-256-GCM key for encrypting message bodies at rest.
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    # Must be exactly 64 hex characters (32 bytes = 256-bit key).
    CHAT_ENCRYPTION_KEY: str = os.getenv("CHAT_ENCRYPTION_KEY", "")

    # ── CORS ──
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
        ).split(",")
        if origin.strip()
    ]

    def validate(self) -> None:
        if not self.JWT_SECRET:
            raise RuntimeError("JWT_SECRET must be set to a strong random value.")
        if "*" in self.CORS_ORIGINS:
            raise RuntimeError("CORS_ORIGINS must not be '*' — list allowed origins explicitly.")

    # Where reset/verify links send users back to
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")


settings = Settings()
settings.validate()


# ── Firebase bootstrap (optional) ───────────────────────────────────
# Firebase is now only needed to verify Google sign-in tokens. If it isn't
# configured the rest of the app (email/password auth) still works.
def _init_firebase() -> None:
    if firebase_admin._apps:
        return
    cred_path = settings.GOOGLE_APPLICATION_CREDENTIALS
    if cred_path and Path(cred_path).exists():
        cred = credentials.Certificate(cred_path)
    elif settings.SERVICE_ACCOUNT_KEY.exists():
        cred = credentials.Certificate(str(settings.SERVICE_ACCOUNT_KEY))
    else:
        raise RuntimeError(
            "Firebase Admin credentials missing. Set GOOGLE_APPLICATION_CREDENTIALS "
            "or add backend/serviceAccountKey.json"
        )
    options = {}
    if settings.FIREBASE_STORAGE_BUCKET:
        options["storageBucket"] = settings.FIREBASE_STORAGE_BUCKET
    firebase_admin.initialize_app(cred, options or None)


try:
    _init_firebase()
    FIREBASE_READY = True
    FIREBASE_ERROR = ""
except Exception as exc:  # noqa: BLE001 — surface config errors to /api/health
    FIREBASE_READY = False
    FIREBASE_ERROR = str(exc)
