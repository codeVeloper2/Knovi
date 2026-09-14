-- ══════════════════════════════════════════════════════════════
-- LEARNING SESSION SYSTEM ADDITIONS
-- Run this in the Supabase SQL Editor after the main schema.
-- ══════════════════════════════════════════════════════════════

-- Allow partner_id to be NULL (pending sessions have no partner yet)
ALTER TABLE learning_sessions
  ALTER COLUMN partner_id DROP NOT NULL;

-- Add session_code and expires_at columns
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS session_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ;

-- Unique index on session_code (only enforces uniqueness for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS ix_learning_sessions_code
  ON learning_sessions(session_code)
  WHERE session_code IS NOT NULL;
