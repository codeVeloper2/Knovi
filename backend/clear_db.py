"""One-off: wipe all rows from the users table so you can test from scratch.

Run:  python clear_db.py

Uses the same DATABASE_URL from .env. This DELETES ALL USERS. It does not
drop the table — the schema stays intact.
"""
import asyncio
import selectors
import sys

from sqlalchemy import text

from app.core.database import engine


async def _clear() -> None:
    if engine is None:
        print("DATABASE_URL not configured.")
        return
    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM users"))
        before = result.scalar_one()
        await conn.execute(text("TRUNCATE TABLE users RESTART IDENTITY"))
    print(f"Cleared users table. Rows removed: {before}")


def main() -> None:
    if sys.platform == "win32":
        asyncio.run(_clear(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(_clear())


if __name__ == "__main__":
    main()
