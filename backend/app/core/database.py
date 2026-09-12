"""Async SQLAlchemy engine, session factory, and base model.

Import `get_session` as a FastAPI dependency to get an `AsyncSession`,
and `Base` for declaring ORM models.
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


async def init_models() -> None:
    """Create tables from the ORM metadata, and add any newly-added columns.

    create_all only creates missing *tables*, not new columns on existing
    tables. Since we're iterating, we also run a couple of idempotent
    ALTER TABLE ... ADD COLUMN IF NOT EXISTS statements for columns added
    after the table was first created.
    """
    if engine is None:
        return
    # Import models so they're registered on Base.metadata before create_all.
    from app import models  # noqa: F401
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight, idempotent column additions (safe to run every startup).
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(255)")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(255)")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMPTZ")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(60) NOT NULL DEFAULT ''")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100) NOT NULL DEFAULT ''")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 0")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_count INTEGER NOT NULL DEFAULT 0")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_direct_message BOOLEAN NOT NULL DEFAULT TRUE")
        )
        # ── Chat tables (created by create_all; these guard new columns added later) ──
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)"
        ))
        # ── Match requests (created by create_all) ──
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_match_requests_receiver ON match_requests(receiver_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_match_requests_sender ON match_requests(sender_id)"
        ))
        # ── Study Rooms (created by create_all) ──
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_study_rooms_conv ON study_rooms(conversation_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_room_materials_room ON room_materials(room_id)"
        ))

        # ── Streak columns on users (added after initial table creation) ──
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_date TIMESTAMPTZ"
        ))
        # ── Role column (added for curriculum admin authorization) ──
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student'"
        ))

        # ── Progress tables (created by create_all; these guard indexes) ──
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_earned_badges_user ON earned_badges(user_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id)"
        ))
