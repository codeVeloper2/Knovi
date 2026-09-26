"""Knovi API — application entry point.

Creates the FastAPI app, configures CORS, and mounts the versioned routers.
Tables are managed externally in Supabase — no auto-creation at startup.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1 import ai, auth, chat, learn, notifications, profile, progress, users, feedback
from app.api.v1 import admin_curriculum, curriculum
from app.api.v1 import ai_learning, challenge
from app.api.v1 import learning_profile
from app.api.v1.auth import limiter
from app.core.config import settings
from app.services import challenge_runtime


from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        await challenge_runtime.shutdown()


app = FastAPI(title=settings.APP_TITLE, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routes are served under /api
app.include_router(auth.router,    prefix="/api",        tags=["auth"])
app.include_router(profile.router, prefix="/api",        tags=["profile"])
app.include_router(chat.router,    prefix="/api",        tags=["chat"])
app.include_router(users.router,   prefix="/api/users",  tags=["users"])
app.include_router(ai.router,      prefix="/api/ai",     tags=["ai"])
app.include_router(learn.router,   prefix="/api",        tags=["learn"])
app.include_router(progress.router,       prefix="/api", tags=["progress"])
app.include_router(notifications.router,  prefix="/api", tags=["notifications"])

# ── Admin (curriculum management — requires role=admin) ──
app.include_router(admin_curriculum.router, prefix="/api/admin", tags=["admin-curriculum"])

# ── Student read-only curriculum endpoints ──
app.include_router(curriculum.router, prefix="/api", tags=["curriculum"])

# ── AI Learning Sessions ──
app.include_router(ai_learning.router, prefix="/api", tags=["ai-learning"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])

# ── AI Learning Profile ──
app.include_router(learning_profile.router, prefix="/api", tags=["learning-profile"])

# ── AI Quiz Battle ──
app.include_router(challenge.router, prefix="/api", tags=["challenges"])
