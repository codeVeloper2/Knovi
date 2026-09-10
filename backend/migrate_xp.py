"""One-time migration: add xp column to users table."""
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

db_url = os.environ["DATABASE_URL"]

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    print("Migration complete: xp column is ready.")
