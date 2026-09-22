-- PeerUP AI Quiz Battle
-- Applied to the existing Supabase/PostgreSQL schema after 001_ai_learning_sessions.
-- This repository does not contain an Alembic environment; database changes are
-- managed as numbered SQL migrations run in Supabase.

BEGIN;

-- AI-learning provenance: persist the curriculum objectives actually covered by
-- each saved teaching snapshot so challenge eligibility can use exact objective
-- intersection instead of guessing from free-form chat text.
ALTER TABLE ai_session_teaching
    ADD COLUMN IF NOT EXISTS objective_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_teaching_objectives
    ON ai_session_teaching USING GIN (objective_ids);

CREATE TABLE IF NOT EXISTS challenge_sessions (
    id SERIAL PRIMARY KEY,
    challenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
    concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,

    -- These are the exact source sessions used at challenge creation time.
    -- They may become NULL if a source session is later deleted, but the frozen
    -- challenge question snapshots remain intact.
    source_session_a_id INTEGER REFERENCES ai_learning_sessions(id) ON DELETE SET NULL,
    source_session_b_id INTEGER REFERENCES ai_learning_sessions(id) ON DELETE SET NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    question_count INTEGER NOT NULL DEFAULT 5,
    current_question INTEGER NOT NULL DEFAULT 0,

    challenger_ready BOOLEAN NOT NULL DEFAULT FALSE,
    opponent_ready BOOLEAN NOT NULL DEFAULT FALSE,
    challenger_ready_at TIMESTAMPTZ,
    opponent_ready_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    preparation_started_at TIMESTAMPTZ,
    preparation_error TEXT,

    countdown_started_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    current_question_started_at TIMESTAMPTZ,
    current_question_deadline_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    challenger_disconnected_at TIMESTAMPTZ,
    opponent_disconnected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ck_challenge_distinct_participants
        CHECK (challenger_id <> opponent_id),
    CONSTRAINT ck_challenge_question_count
        CHECK (question_count BETWEEN 3 AND 10),
    CONSTRAINT ck_challenge_current_question
        CHECK (current_question BETWEEN 0 AND 10),
    CONSTRAINT ck_challenge_status
        CHECK (status IN (
            'created', 'pending', 'accepted', 'preparing', 'waiting', 'countdown',
            'question_active', 'waiting_for_opponent', 'question_reveal', 'next_question',
            'completed', 'declined', 'cancelled', 'expired'
        ))
);

CREATE INDEX IF NOT EXISTS idx_challenges_challenger
    ON challenge_sessions(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent
    ON challenge_sessions(opponent_id);
CREATE INDEX IF NOT EXISTS idx_challenges_concept
    ON challenge_sessions(concept_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status
    ON challenge_sessions(status);
CREATE INDEX IF NOT EXISTS idx_challenges_expires
    ON challenge_sessions(expires_at);

-- Prevent duplicate live battles for the same unordered student pair + concept,
-- even under concurrent POST /challenges requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_active_pair_concept
    ON challenge_sessions (
        LEAST(challenger_id, opponent_id),
        GREATEST(challenger_id, opponent_id),
        concept_id
    )
    WHERE status IN (
        'pending', 'accepted', 'preparing', 'waiting', 'countdown',
        'question_active', 'waiting_for_opponent', 'question_reveal', 'next_question'
    );

CREATE TABLE IF NOT EXISTS challenge_questions (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES challenge_sessions(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    objective_id INTEGER NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer VARCHAR(1) NOT NULL,
    explanation TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_challenge_question_number UNIQUE (challenge_id, question_number),
    CONSTRAINT uq_challenge_question_session_id UNIQUE (challenge_id, id),
    CONSTRAINT ck_challenge_question_number CHECK (question_number BETWEEN 1 AND 10),
    CONSTRAINT ck_challenge_correct_answer CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    CONSTRAINT ck_challenge_question_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CONSTRAINT ck_challenge_question_options_object CHECK (jsonb_typeof(options) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_challenge_questions_challenge
    ON challenge_questions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_questions_objective
    ON challenge_questions(objective_id);

CREATE TABLE IF NOT EXISTS challenge_answers (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES challenge_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer VARCHAR(1),
    is_correct BOOLEAN NOT NULL,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_time_ms INTEGER,
    timed_out BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT uq_challenge_answer_participant_question
        UNIQUE (challenge_id, question_id, user_id),
    CONSTRAINT fk_challenge_answer_question_in_challenge
        FOREIGN KEY (challenge_id, question_id)
        REFERENCES challenge_questions(challenge_id, id)
        ON DELETE CASCADE,
    CONSTRAINT ck_challenge_answer_option
        CHECK (answer IS NULL OR answer IN ('A', 'B', 'C', 'D')),
    CONSTRAINT ck_challenge_response_time_nonnegative
        CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
    CONSTRAINT ck_challenge_answer_timeout_consistency
        CHECK ((timed_out = TRUE AND answer IS NULL) OR (timed_out = FALSE AND answer IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_challenge_answers_challenge
    ON challenge_answers(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_answers_question
    ON challenge_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_challenge_answers_user
    ON challenge_answers(user_id);

CREATE TABLE IF NOT EXISTS challenge_results (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES challenge_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    accuracy INTEGER NOT NULL DEFAULT 0,
    weak_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT NOT NULL DEFAULT '',
    performance JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_challenge_result_participant UNIQUE (challenge_id, user_id),
    CONSTRAINT ck_challenge_result_score CHECK (score BETWEEN 0 AND 10),
    CONSTRAINT ck_challenge_result_accuracy CHECK (accuracy BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_challenge_results_challenge
    ON challenge_results(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_results_user
    ON challenge_results(user_id);

COMMIT;
