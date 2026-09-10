"""PeerUP API — application entry point.

Creates the FastAPI app, configures CORS, creates DB tables on startup,
and mounts the versioned routers.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1 import ai, auth, chat, learn, match, profile, rooms, users
from app.api.v1.auth import limiter
from app.core.config import settings
from app.core.database import init_models


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_models()
    yield


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
app.include_router(match.router,   prefix="/api/match",  tags=["match"])
app.include_router(ai.router,      prefix="/api/ai",     tags=["ai"])
app.include_router(rooms.router,   prefix="/api",        tags=["rooms"])
app.include_router(learn.router,   prefix="/api",        tags=["learn"])
