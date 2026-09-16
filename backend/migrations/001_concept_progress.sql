-- ============================================================
-- PeerUP — Sequential Concept Learning Migration
-- Run this once on your Supabase SQL editor.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ── 1. concept_progress table ──────────────────────────────────────────────
-- Tracks a student's sequential learning progress for a specific concept.
-- Flow: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified

CREATE TABLE IF NOT EXISTS concept_progress (
    id                          SERIAL PRIMARY KEY,
    user_id                     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id                  INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    
    -- Current stage in the learning pipeline
    current_stage               VARCHAR(40) NOT NULL DEFAULT 'lesson',
    
    -- AI-generated lesson content (saved for checkpoint generation)
    lesson_content              JSONB,
    lesson_completed            BOOLEAN NOT NULL DEFAULT FALSE,
    lesson_completed_at         TIMESTAMPTZ,
    
    -- Checkpoint attempts (array of {questions, answers, score, passed, timestamp})
    checkpoint_attempts         JSONB NOT NULL DEFAULT '[]'::jsonb,
    checkpoint_passed           BOOLEAN NOT NULL DEFAULT FALSE,
    checkpoint_passed_at        TIMESTAMPTZ,
    
    -- Reteaching content after failed checkpoint
    reteaching_content          JSONB,
    reteaching_count            INTEGER NOT NULL DEFAULT 0,
    
    -- Explain It attempts (array of {explanation, ai_result, timestamp})
    explanation_attempts        JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation_passed          BOOLEAN NOT NULL DEFAULT FALSE,
    explanation_passed_at       TIMESTAMPTZ,
    
    -- AI Verification result (latest)
    ai_verification_result      JSONB,
    ai_verification_passed      BOOLEAN NOT NULL DEFAULT FALSE,
    ai_verification_at          TIMESTAMPTZ,
    
    -- Ask AI Q&A history
    ask_ai_questions            JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Challenge eligibility and completion
    challenge_eligible          BOOLEAN NOT NULL DEFAULT FALSE,
    challenge_session_id        INTEGER,
    challenge_passed            BOOLEAN NOT NULL DEFAULT FALSE,
    challenge_passed_at         TIMESTAMPTZ,
    
    -- Final verification (concept mastered)
    verified                    BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at                 TIMESTAMPTZ,
    
    -- Metadata
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT uq_concept_progress_user_concept UNIQUE (user_id, concept_id)
);

-- ── 2. Indexes for performance ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_concept_progress_user_id
    ON concept_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_concept_progress_concept_id
    ON concept_progress(concept_id);

CREATE INDEX IF NOT EXISTS idx_concept_progress_current_stage
    ON concept_progress(current_stage);

CREATE INDEX IF NOT EXISTS idx_concept_progress_challenge_eligible
    ON concept_progress(challenge_eligible)
    WHERE challenge_eligible = TRUE;

CREATE INDEX IF NOT EXISTS idx_concept_progress_verified
    ON concept_progress(verified)
    WHERE verified = TRUE;

-- ── 3. Check constraint for valid stages ────────────────────────────────────

ALTER TABLE concept_progress
    DROP CONSTRAINT IF EXISTS ck_concept_progress_current_stage;

ALTER TABLE concept_progress
    ADD CONSTRAINT ck_concept_progress_current_stage
    CHECK (current_stage IN (
        'lesson', 'checkpoint', 'explain', 'ai_verification', 
        'ask_ai', 'challenge', 'verified'
    ));

-- ── 4. Updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_concept_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_concept_progress_updated_at ON concept_progress;

CREATE TRIGGER trigger_concept_progress_updated_at
    BEFORE UPDATE ON concept_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_concept_progress_updated_at();

-- ── 5. Add relationship to users table (optional backref) ────────────────────
-- This comment documents the relationship but does not modify the users table.
-- The ORM handles the back_populates="concept_progress" via relationship().

-- ============================================================
-- END OF MIGRATION
-- ============================================================
