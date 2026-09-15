-- ============================================================================
-- PEERUP V2 — LEGACY DATABASE CLEANUP
-- ============================================================================
-- PURPOSE : Remove database tables/columns that belonged exclusively to the
--           old Study Room and teacher-led Learning Session systems.
--
-- STATUS  : REVIEW ONLY — DO NOT EXECUTE AUTOMATICALLY.
--           Review each statement carefully, back up your data, and run
--           during a scheduled maintenance window.
--
-- SAFE    : All new-system tables are left untouched:
--           concept_progress, checkpoint_answers, explanation_attempts,
--           sync_sessions, sync_warmup_answers, sync_quiz_exchanges,
--           sync_gaps, users, conversations, messages, match_requests,
--           subjects, topics, concepts, questions, resources, ...
--
-- Order matters: child tables must be dropped before parent tables to satisfy
-- foreign-key constraints. All FKs below use ON DELETE CASCADE so the order
-- shown is safe.
-- ============================================================================

BEGIN;

-- ── 1. OLD STUDY ROOMS ───────────────────────────────────────────────────────

-- room_materials references study_rooms
DROP TABLE IF EXISTS room_materials CASCADE;

-- study_rooms references users and conversations
DROP TABLE IF EXISTS study_rooms CASCADE;

-- ── 2. OLD TEACHER-LED LEARNING SESSIONS ────────────────────────────────────

-- session_activity_results references learning_sessions, users, learning_activities
DROP TABLE IF EXISTS session_activity_results CASCADE;

-- session_practice_answers references learning_sessions, questions, users
DROP TABLE IF EXISTS session_practice_answers CASCADE;

-- session_teaching_exchanges references learning_sessions, concepts, users
DROP TABLE IF EXISTS session_teaching_exchanges CASCADE;

-- learning_sessions references users, topics, concepts, questions, conversations
DROP TABLE IF EXISTS learning_sessions CASCADE;

-- ── 3. VERIFY PRESERVED TABLES EXIST (sanity check — run as a SELECT) ────────
-- Uncomment and run these as a separate read-only check before the DROP block.

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'concept_progress', 'checkpoint_answers', 'explanation_attempts',
--     'sync_sessions', 'sync_warmup_answers', 'sync_quiz_exchanges', 'sync_gaps',
--     'users', 'conversations', 'messages', 'match_requests',
--     'subjects', 'topics', 'concepts', 'questions', 'learning_activities',
--     'resources', 'topic_progress', 'resource_downloads',
--     'courses', 'lessons', 'tutorials', 'video_progress',
--     'course_enrollments', 'saved_content', 'learn_comments',
--     'earned_badges', 'certificates'
--   )
-- ORDER BY table_name;

COMMIT;

-- ============================================================================
-- NOTES
-- ============================================================================
-- • study_rooms.conversation_id FK: points to conversations (shared/kept).
--   CASCADE here only removes the study_rooms row — conversations are safe.
-- • learning_sessions.conversation_id FK: same — conversations unaffected.
-- • No Solo Learning tables are touched by any statement above.
-- • No Sync tables are touched by any statement above.
-- • After running, remove this file from version control or archive it.
-- ============================================================================
