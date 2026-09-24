-- PeerUP Learning Room: mastery-loop assessment support
-- Adds learner-safe hints to persisted practice questions.

ALTER TABLE ai_session_questions
  ADD COLUMN IF NOT EXISTS hint TEXT;

ALTER TABLE ai_session_questions
  ADD COLUMN IF NOT EXISTS stage VARCHAR(30) NOT NULL DEFAULT 'independent_practice';

ALTER TABLE ai_session_questions
  ADD COLUMN IF NOT EXISTS skill VARCHAR(30) NOT NULL DEFAULT 'application';
