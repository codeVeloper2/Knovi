-- ============================================================
-- PeerUP — Challenge Sessions Migration
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ── 1. challenge_sessions ─────────────────────────────────────────────────
-- One row per peer challenge attempt.

CREATE TABLE IF NOT EXISTS challenge_sessions (
    id                      SERIAL PRIMARY KEY,
    concept_id              INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    topic_id                INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    subject_id              INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    initiator_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- State machine
    -- waiting → lobby → questions → peer_exchange → evaluating → completed | failed | cancelled
    status                  VARCHAR(30) NOT NULL DEFAULT 'waiting',

    -- Lobby readiness
    initiator_ready         BOOLEAN NOT NULL DEFAULT FALSE,
    partner_ready           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Questions phase: AI-generated 5 questions for this session
    questions               JSONB,                     -- [{question, options, correctAnswer, ...}]
    questions_generated_at  TIMESTAMPTZ,

    -- Answers: each student answers independently
    initiator_answers       JSONB DEFAULT '[]'::jsonb, -- [{questionIndex, answer, isCorrect, ...}]
    partner_answers         JSONB DEFAULT '[]'::jsonb,
    initiator_score         INTEGER,                   -- 0-100
    partner_score           INTEGER,

    -- Peer-to-peer exchange
    peer_exchanges          JSONB DEFAULT '[]'::jsonb, -- [{asker_id, question, answer, is_correct, hint_used, ...}]

    -- Final evaluation
    initiator_passed        BOOLEAN,
    partner_passed          BOOLEAN,
    evaluation_result       JSONB,                     -- Full AI evaluation output
    evaluated_at            TIMESTAMPTZ,

    -- Disconnect / expiry handling
    initiator_last_seen     TIMESTAMPTZ,
    partner_last_seen       TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,               -- Auto-expire waiting sessions

    -- Timestamps
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_challenge_status CHECK (status IN (
        'waiting', 'lobby', 'questions', 'peer_exchange', 'evaluating', 'completed', 'failed', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS idx_challenge_sessions_concept
    ON challenge_sessions(concept_id);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_initiator
    ON challenge_sessions(initiator_id);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_partner
    ON challenge_sessions(partner_id);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_status
    ON challenge_sessions(status);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_waiting
    ON challenge_sessions(concept_id, status)
    WHERE status = 'waiting';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_challenge_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_challenge_sessions_updated_at ON challenge_sessions;
CREATE TRIGGER trigger_challenge_sessions_updated_at
    BEFORE UPDATE ON challenge_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_challenge_sessions_updated_at();

-- ── END OF MIGRATION ──────────────────────────────────────────────────────
