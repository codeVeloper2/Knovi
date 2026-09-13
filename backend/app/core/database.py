"""Async SQLAlchemy engine, session factory, and base model.

Import `get_session` as a FastAPI dependency to get an `AsyncSession`,
and `Base` for declaring ORM models.

Tables are managed externally (Supabase / SQL migrations).
The ORM models are used purely for query mapping — no auto-creation
or ALTER TABLE migrations run at startup.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


# Engine is created lazily-safe: if DATABASE_URL is empty we still let the app
# import, but any DB use will raise a clear error.
engine = (
    create_async_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        future=True,
        connect_args={"prepare_threshold": None},  # disable prepared stmts for PgBouncer
    )
    if settings.DATABASE_URL
    else None
)

SessionLocal = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine is not None
    else None
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured. Set it in backend/.env")
    async with SessionLocal() as session:
        yield session
