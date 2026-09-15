"""
DB migration: create solo learning + sync tables.

Run once:
    python migrate_solo_sync.py

Uses the same DATABASE_URL as the app. Tables are created only if they
don't already exist (CREATE TABLE IF NOT EXISTS via SQLAlchemy metadata).
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make sure the backend package is on the path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import Base, engine          # noqa: E402 – path setup above
import app.models  # noqa: F401 – registers ALL models on Base.metadata


NEW_TABLES = [
    "concept_progress",
    "checkpoint_answers",
    "explanation_attempts",
    "sync_sessions",
    "sync_warmup_answers",
    "sync_quiz_exchanges",
    "sync_gaps",
]


async def migrate() -> None:
    print("Connecting to database…")
    async with engine.begin() as conn:
        # Only create the new tables; leave every existing table untouched.
        tables_to_create = [
            Base.metadata.tables[t]
            for t in NEW_TABLES
            if t in Base.metadata.tables
        ]

        if not tables_to_create:
            print("No new tables found in metadata — check model imports.")
            return

        print(f"Creating {len(tables_to_create)} new table(s):")
        for t in tables_to_create:
            print(f"  • {t.name}")

        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn,
                tables=tables_to_create,
                checkfirst=True,   # safe: skips tables that already exist
            )
        )

    print("\n✓ Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
