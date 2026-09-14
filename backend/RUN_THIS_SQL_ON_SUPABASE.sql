-- ══════════════════════════════════════════════════════════════
-- PeerUP Peer Teaching System — Database Additions
-- Run this in the Supabase SQL Editor.
-- All statements are idempotent (IF NOT EXISTS / DROP NOT NULL).
-- ══════════════════════════════════════════════════════════════

-- ── 1. learning_sessions: new columns for peer-teaching roles + phase ──

-- Allow partner_id to be NULL (pending sessions have no partner yet)
ALTER TABLE learning_sessions
  ALTER COLUMN partner_id DROP NOT NULL;

-- Session code and expiry (may already exist from previous migration)
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS session_code        VARCHAR(12),
  ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ;

-- Peer-teaching roles
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS teacher_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS learner_id          INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Phase tracking: setup → concepts → practice → challenge → summary
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS phase               VARCHAR(20) NOT NULL DEFAULT 'setup';

-- Index for phase-based queries
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS current_concept_idx INTEGER NOT NULL DEFAULT 0;

-- Readiness flags for setup phase
ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS teacher_ready       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS learner_ready       BOOLEAN NOT NULL DEFAULT FALSE;

-- Unique index on session_code (partial — only for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS ix_learning_sessions_code
  ON learning_sessions(session_code)
  WHERE session_code IS NOT NULL;

-- Index on teacher and learner
CREATE INDEX IF NOT EXISTS idx_learning_sessions_teacher ON learning_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_learner ON learning_sessions(learner_id);


-- ── 2. session_activity_results: AI + teacher verdict columns ──

-- Link to the specific concept being explained
ALTER TABLE session_activity_results
  ADD COLUMN IF NOT EXISTS concept_id              INTEGER REFERENCES concepts(id) ON DELETE SET NULL;

-- AI result fields
ALTER TABLE session_activity_results
  ADD COLUMN IF NOT EXISTS ai_verdict              VARCHAR(20),      -- correct | partial | incorrect
  ADD COLUMN IF NOT EXISTS ai_confidence           NUMERIC(4,3),     -- 0.000–1.000
  ADD COLUMN IF NOT EXISTS ai_provider             VARCHAR(20),      -- gemini | groq
  ADD COLUMN IF NOT EXISTS misconceptions_detected JSONB;            -- [{name, correction}]

-- Teacher verdict fields
ALTER TABLE session_activity_results
  ADD COLUMN IF NOT EXISTS teacher_verdict         VARCHAR(20),      -- approved | retry
  ADD COLUMN IF NOT EXISTS teacher_comment         TEXT;

-- Index for concept-based lookups
CREATE INDEX IF NOT EXISTS idx_session_results_concept ON session_activity_results(concept_id);

-- Add CHECK constraint on phase (safe — only enforces future inserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_learning_sessions_phase'
  ) THEN
    ALTER TABLE learning_sessions
      ADD CONSTRAINT chk_learning_sessions_phase
      CHECK (phase IN ('setup','concepts','practice','challenge','summary'));
  END IF;
END$$;
