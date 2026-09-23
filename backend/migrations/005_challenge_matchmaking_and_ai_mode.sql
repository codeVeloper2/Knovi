-- PeerUP Challenge v2: automatic peer matchmaking + AI fallback mode.
-- Applied after 004_nerdc_curriculum.sql.
-- Database changes are managed as numbered SQL migrations in Supabase.

BEGIN;

-- Existing peer battles remain unchanged. AI fallback battles have one real
-- participant (challenger_id) and use opponent_id=NULL.
ALTER TABLE challenge_sessions
    ALTER COLUMN opponent_id DROP NOT NULL;

ALTER TABLE challenge_sessions
    DROP CONSTRAINT IF EXISTS ck_challenge_distinct_participants;
ALTER TABLE challenge_sessions
    ADD CONSTRAINT ck_challenge_distinct_participants
    CHECK (opponent_id IS NULL OR challenger_id <> opponent_id);

ALTER TABLE challenge_sessions
    ADD COLUMN IF NOT EXISTS challenge_mode VARCHAR(10) NOT NULL DEFAULT 'peer';

ALTER TABLE challenge_sessions
    DROP CONSTRAINT IF EXISTS ck_challenge_mode;
ALTER TABLE challenge_sessions
    ADD CONSTRAINT ck_challenge_mode
    CHECK (challenge_mode IN ('peer', 'ai'));

CREATE INDEX IF NOT EXISTS idx_challenges_mode
    ON challenge_sessions(challenge_mode);

CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_active_ai_user_concept
    ON challenge_sessions (challenger_id, concept_id)
    WHERE challenge_mode = 'ai'
      AND status IN (
        'accepted', 'preparing', 'waiting', 'countdown',
        'question_active', 'waiting_for_opponent', 'question_reveal', 'next_question'
      );

-- A queue row represents an explicit opt-in to automatic Challenge matchmaking.
-- It is deliberately separate from Discover: joining this queue means the
-- student has already completed the AI-learning session and wants a Challenge.
CREATE TABLE IF NOT EXISTS challenge_match_queue (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
    concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
    source_session_id INTEGER NOT NULL REFERENCES ai_learning_sessions(id) ON DELETE CASCADE,
    class_level VARCHAR(40) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    challenge_id INTEGER REFERENCES challenge_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_challenge_match_queue_status
        CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_challenge_match_queue_context
    ON challenge_match_queue(subject_id, topic_id, concept_id, status);
CREATE INDEX IF NOT EXISTS idx_challenge_match_queue_user
    ON challenge_match_queue(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_match_queue_active_user
    ON challenge_match_queue(user_id)
    WHERE status = 'waiting';

COMMIT;
