"""Alembic environment for PeerUP — async SQLAlchemy (psycopg3).

Reads DATABASE_URL from the .env file, normalises it to the psycopg driver,
imports all ORM models so Base.metadata is fully populated, then runs
migrations in offline or online (async) mode.
"""
from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ── make sure the backend package is importable ──────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1]   # .../backend
sys.path.insert(0, str(BACKEND_DIR))

# Load .env so DATABASE_URL (and JWT_SECRET etc.) are available before
# the app modules import Settings.
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env", override=True)

# ── import app settings & models ─────────────────────────────────────────────
from app.core.config import settings          # noqa: E402 — after sys.path fix
from app.core.database import Base            # noqa: E402
import app.models                             # noqa: E402,F401 — registers all ORM models

# ── Alembic Config object ─────────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url at runtime so we never hard-code credentials.
# configparser interprets % as interpolation; escape each % as %% to prevent that.
_safe_url = settings.DATABASE_URL.replace("%", "%%")
config.set_main_option("sqlalchemy.url", _safe_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ─────────────────────────────────────────────────────────────────────────────
# Offline mode  (alembic upgrade head --sql)
# ─────────────────────────────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ─────────────────────────────────────────────────────────────────────────────
# Online mode  (alembic upgrade head)
# ─────────────────────────────────────────────────────────────────────────────
def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
