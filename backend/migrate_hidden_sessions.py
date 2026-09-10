"""One-time migration: add hidden_for_creator / hidden_for_partner columns to study_rooms."""
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

db_url = os.environ["DATABASE_URL"]

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            ALTER TABLE study_rooms
                ADD COLUMN IF NOT EXISTS hidden_for_creator BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS hidden_for_partner BOOLEAN NOT NULL DEFAULT FALSE
        """)
    conn.commit()
    print("Migration complete: hidden_for_creator and hidden_for_partner columns are ready.")
