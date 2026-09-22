-- PeerUP Peer Discovery — Learning Overlap Indexes
-- Applied after 002_ai_quiz_battle.sql.
--
-- These partial indexes accelerate the concept/topic/subject overlap queries
-- used by GET /api/users/discover?section=learning_peers.
--
-- They are PARTIAL (WHERE status NOT IN …) so they only index rows that are
-- actually eligible for learning-overlap matching — keeping them lean even
-- as the table grows.
--
-- Check for prior existence before applying:
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'ai_learning_sessions';
--
-- If idx_ai_sessions_concept_user, idx_ai_sessions_topic_user, and
-- idx_ai_sessions_subject_user are already present, this migration is a no-op.

BEGIN;

-- Fast lookup: "who else is studying concept X?" (primary overlap signal)
CREATE INDEX IF NOT EXISTS idx_ai_sessions_concept_user
    ON ai_learning_sessions (concept_id, user_id)
    WHERE status NOT IN ('abandoned', 'created');

-- Fast lookup: "who else is in topic Y?" (secondary overlap signal)
CREATE INDEX IF NOT EXISTS idx_ai_sessions_topic_user
    ON ai_learning_sessions (topic_id, user_id)
    WHERE status NOT IN ('abandoned', 'created');

-- Fast lookup: "who else studies subject Z?" (weakest overlap signal)
CREATE INDEX IF NOT EXISTS idx_ai_sessions_subject_user
    ON ai_learning_sessions (subject_id, user_id)
    WHERE status NOT IN ('abandoned', 'created');

COMMIT;
