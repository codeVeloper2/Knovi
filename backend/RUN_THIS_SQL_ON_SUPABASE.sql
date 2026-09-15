-- ============================================================
-- PeerUP — Teacher-Led Learning Session Migration
-- Run this once on your Supabase SQL editor.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ── 1. New columns on learning_sessions ────────────────────────────────────

ALTER TABLE learning_sessions
    ADD COLUMN IF NOT EXISTS session_description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS workflow_state       VARCHAR(40) NOT NULL DEFAULT 'LOBBY',
    ADD COLUMN IF NOT EXISTS conversation_id      BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS current_concept_id   INTEGER REFERENCES concepts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS current_practice_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL;

-- Index the new state column for fast polling queries
CREATE INDEX IF NOT EXISTS idx_learning_sessions_workflow_state
    ON learning_sessions(workflow_state);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_conversation
    ON learning_sessions(conversation_id);

-- Check constraint so only valid states can be stored
-- (DROP first if it already exists from a previous attempt)
ALTER TABLE learning_sessions
    DROP CONSTRAINT IF EXISTS ck_learning_sessions_workflow_state;

ALTER TABLE learning_sessions
    ADD CONSTRAINT ck_learning_sessions_workflow_state
    CHECK (workflow_state IN (
        'LOBBY', 'TEACHING_CONCEPT', 'LEARNER_READING',
        'EXPLAIN_BACK_REQUESTED', 'LEARNER_EXPLAINING', 'TEACHER_REVIEW',
        'NEXT_CONCEPT', 'PRACTICE', 'PRACTICE_REVEAL', 'ROLE_REVERSAL', 'COMPLETED'
    ));

-- Backfill existing rows so the constraint doesn't reject them
UPDATE learning_sessions
    SET workflow_state = CASE
        WHEN status = 'completed'   THEN 'COMPLETED'
        WHEN phase   = 'practice'   THEN 'PRACTICE'
        WHEN phase   = 'challenge'  THEN 'ROLE_REVERSAL'
        WHEN phase   = 'concepts'   THEN 'TEACHING_CONCEPT'
        ELSE 'LOBBY'
    END
WHERE workflow_state NOT IN (
    'LOBBY', 'TEACHING_CONCEPT', 'LEARNER_READING',
    'EXPLAIN_BACK_REQUESTED', 'LEARNER_EXPLAINING', 'TEACHER_REVIEW',
    'NEXT_CONCEPT', 'PRACTICE', 'PRACTICE_REVEAL', 'ROLE_REVERSAL', 'COMPLETED'
);

-- ── 2. session_teaching_exchanges ──────────────────────────────────────────
-- Stores the teacher's written explanation for each concept and tracks
-- whether the learner has acknowledged it.

CREATE TABLE IF NOT EXISTS session_teaching_exchanges (
    id                          SERIAL PRIMARY KEY,
    session_id                  INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    concept_id                  INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    teacher_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    explanation                 TEXT    NOT NULL,
    learner_read_at             TIMESTAMPTZ,
    explain_back_requested_at   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_teaching_exchange_concept UNIQUE (session_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_session_teaching_exchanges_session
    ON session_teaching_exchanges(session_id);

CREATE INDEX IF NOT EXISTS idx_session_teaching_exchanges_concept
    ON session_teaching_exchanges(concept_id);

-- ── 3. session_practice_answers ────────────────────────────────────────────
-- One row per (session, question, user).  Both rows must exist before answers
-- are revealed — prevents one student seeing the other's answer early.

CREATE TABLE IF NOT EXISTS session_practice_answers (
    id           SERIAL PRIMARY KEY,
    session_id   INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response     TEXT    NOT NULL,
    is_correct   BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_practice_answer UNIQUE (session_id, question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_practice_answers_session
    ON session_practice_answers(session_id);

-- ── 4. teacher_id / learner_id on existing rows (safety backfill) ──────────
-- Old sessions created before roles were tracked: set teacher = creator.

UPDATE learning_sessions
    SET teacher_id = creator_id
WHERE teacher_id IS NULL AND creator_id IS NOT NULL;

UPDATE learning_sessions
    SET learner_id = partner_id
WHERE learner_id IS NULL AND partner_id IS NOT NULL;

-- ── Done ───────────────────────────────────────────────────────────────────
-- After running this, deploy the new backend to Railway.
-- No further manual steps are required.
