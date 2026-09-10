"""One-time migration: add hidden_for column to messages table."""
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

# psycopg3 uses postgresql:// directly (no driver prefix needed)
db_url = os.environ["DATABASE_URL"]

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS hidden_for INTEGER[]")
    conn.commit()
    print("Migration complete: hidden_for column is ready.")
