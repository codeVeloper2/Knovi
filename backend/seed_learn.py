"""Seed script: insert test learn content for development.

Adds:
  - 1 Physics tutorial using a YouTube embed link
  - 1 Physics course with 2 lessons

Run from the backend folder:
    .venv\Scripts\python.exe seed_learn.py
"""
import asyncio
import selectors
import sys
import os
from pathlib import Path

# ── Load .env ─────────────────────────────────────────────────────────────
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

# ── Fix driver: force psycopg (v3 async) ─────────────────────────────────
_raw_url = os.environ.get("DATABASE_URL", "")
if not _raw_url:
    print("ERROR: DATABASE_URL not found in .env")
    sys.exit(1)

# Replace any existing driver prefix with the correct async one
for _prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://",
                "postgresql+psycopg://", "postgresql://", "postgres://"):
    if _raw_url.startswith(_prefix):
        _raw_url = "postgresql+psycopg://" + _raw_url[len(_prefix):]
        break

DATABASE_URL = _raw_url

YOUTUBE_EMBED = "https://www.youtube.com/embed/ZAqIoDhornk"
YOUTUBE_THUMB = "https://img.youtube.com/vi/ZAqIoDhornk/hqdefault.jpg"


async def _seed() -> None:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy import text

    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # ── 0. Make creator_id nullable (idempotent) ──────────────────
        await db.execute(text(
            "ALTER TABLE learn_tutorials ALTER COLUMN creator_id DROP NOT NULL"
        ))
        await db.execute(text(
            "ALTER TABLE learn_courses ALTER COLUMN creator_id DROP NOT NULL"
        ))
        await db.commit()

        # ── Tutorial ──────────────────────────────────────────────────
        row = (await db.execute(
            text("SELECT id FROM learn_tutorials WHERE video_url = :u LIMIT 1"),
            {"u": YOUTUBE_EMBED},
        )).fetchone()

        if row:
            print(f"Tutorial already exists (id={row[0]}). Skipping.")
        else:
            await db.execute(text("""
                INSERT INTO learn_tutorials (
                    creator_id, creator_name, creator_photo,
                    title, subject, topic, description,
                    video_url, thumbnail_url, duration_seconds,
                    views, rating, rating_count, status, rejection_reason, created_at
                ) VALUES (
                    NULL, 'PeerUp Seeds', '',
                    :title, 'Physics', 'Newton''s Laws', :desc,
                    :video, :thumb, 0,
                    0, 0.0, 0, 'approved', '', NOW()
                )
            """), {
                "title": "Newton's Laws of Motion — Physics Explained",
                "desc":  (
                    "A clear walkthrough of Newton's three laws of motion with real-world "
                    "examples. Great for students preparing for exams or just starting out in Physics."
                ),
                "video": YOUTUBE_EMBED,
                "thumb": YOUTUBE_THUMB,
            })
            await db.commit()
            row = (await db.execute(
                text("SELECT id FROM learn_tutorials WHERE video_url = :u LIMIT 1"),
                {"u": YOUTUBE_EMBED},
            )).fetchone()
            print(f"✅ Tutorial created  id={row[0]}  title='Newton's Laws of Motion'")

        # ── Course ────────────────────────────────────────────────────
        crow = (await db.execute(
            text("SELECT id FROM learn_courses WHERE title = 'Physics Basics' LIMIT 1")
        )).fetchone()

        if crow:
            print(f"Course already exists (id={crow[0]}). Skipping.")
        else:
            await db.execute(text("""
                INSERT INTO learn_courses (
                    title, description, subject, thumbnail_url,
                    creator_id, creator_name, is_official,
                    rating, rating_count, is_published, created_at
                ) VALUES (
                    'Physics Basics',
                    'An introductory course covering fundamental Physics — motion, forces, energy, and waves.',
                    'Physics', :thumb,
                    NULL, 'PeerUp', TRUE,
                    4.8, 12, TRUE, NOW()
                )
            """), {"thumb": YOUTUBE_THUMB})
            await db.commit()

            crow = (await db.execute(
                text("SELECT id FROM learn_courses WHERE title = 'Physics Basics' LIMIT 1")
            )).fetchone()
            cid = crow[0]

            # Lesson 1 — YouTube video
            await db.execute(text("""
                INSERT INTO learn_lessons (
                    course_id, title, description,
                    video_url, thumbnail_url, duration_seconds,
                    "order", is_free, created_at
                ) VALUES (
                    :cid,
                    'Lesson 1 — Newton''s Laws of Motion',
                    'Understand the three laws that govern how objects move and interact.',
                    :video, :thumb, 0, 1, TRUE, NOW()
                )
            """), {"cid": cid, "video": YOUTUBE_EMBED, "thumb": YOUTUBE_THUMB})

            # Lesson 2 — placeholder
            await db.execute(text("""
                INSERT INTO learn_lessons (
                    course_id, title, description,
                    video_url, thumbnail_url, duration_seconds,
                    "order", is_free, created_at
                ) VALUES (
                    :cid,
                    'Lesson 2 — Forces and Free Body Diagrams',
                    'Learn how to draw and interpret free body diagrams to solve force problems.',
                    '', '', 0, 2, TRUE, NOW()
                )
            """), {"cid": cid})

            await db.commit()
            print(f"✅ Course created    id={cid}  title='Physics Basics'  lessons=2")

    await engine.dispose()
    print("\nDone. Restart the backend and open /app/learn to see the content.")


def main() -> None:
    if sys.platform == "win32":
        asyncio.run(
            _seed(),
            loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()),
        )
    else:
        asyncio.run(_seed())


if __name__ == "__main__":
    main()
