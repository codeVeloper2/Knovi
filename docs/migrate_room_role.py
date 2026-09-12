"""One-time migration: add creator_role column to study_rooms table."""
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

db_url = os.environ["DATABASE_URL"]

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS creator_role VARCHAR(20)"
        )
    conn.commit()
    print("Migration complete: creator_role column is ready.")
