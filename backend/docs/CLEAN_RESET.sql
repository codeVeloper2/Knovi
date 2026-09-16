-- ============================================================
-- PeerUP — CLEAN LEARNING SYSTEM RESET
-- Run this on Supabase SQL editor.
--
-- PURPOSE: Remove ALL old learning system tables and data so the
--          codebase is clean for the new AI Learning Session workflow.
--
-- SAFE:    users, conversations, messages, match_requests, and all
--          non-learning tables are preserved.
--
-- ORDER:   Children before parents — FK-safe throughout.
-- ============================================================

BEGIN;

-- ── STEP 1: DROP OLD LEARNING TABLES (complete removal) ───────────────────
-- These tables no longer exist in the codebase and have no role in the new
-- system. Drop in FK-safe order (children first).

-- 1a. concept_progress (new 7-stage pipeline)
--     FK children: none (leaf table)
DROP TABLE IF EXISTS concept_progress CASCADE;

-- 1b. challenge_sessions
--     FK children: none (leaf table, references concepts/topics/subjects/users)
DROP TABLE IF EXISTS challenge_sessions CASCADE;

-- 1c. checkpoint_answers (old solo system)
--     References: users, concepts, questions
DROP TABLE IF EXISTS checkpoint_answers CASCADE;

-- 1d. explanation_attempts (old solo system)
--     References: users, concepts, topics
DROP TABLE IF EXISTS explanation_attempts CASCADE;

-- 1e. sync child tables (must go before sync_sessions)
DROP TABLE IF EXISTS sync_warmup_answers CASCADE;
DROP TABLE IF EXISTS sync_quiz_exchanges CASCADE;
DROP TABLE IF EXISTS sync_gaps CASCADE;

-- 1f. sync_sessions
--     References: users, topics, concepts
DROP TABLE IF EXISTS sync_sessions CASCADE;

-- 1g. solo_concept_progress (old 4-stage solo system)
--     References: users, topics, concepts
DROP TABLE IF EXISTS solo_concept_progress CASCADE;

-- 1h. Legacy teacher-led learning session tables (from RUN_THIS_SQL_ON_SUPABASE.sql)
--     These may not exist if that migration was never run — IF EXISTS handles that safely.
DROP TABLE IF EXISTS session_activity_results CASCADE;
DROP TABLE IF EXISTS session_practice_answers CASCADE;
DROP TABLE IF EXISTS session_teaching_exchanges CASCADE;
DROP TABLE IF EXISTS learning_sessions CASCADE;

-- 1i. Legacy study room tables
DROP TABLE IF EXISTS room_materials CASCADE;
DROP TABLE IF EXISTS study_rooms CASCADE;


-- ── STEP 2: CLEAR ALL OLD LEARNING DATA FROM KEPT TABLES ─────────────────
-- These tables remain (the new system will repopulate them) but all
-- old-system rows must go.

-- 2a. Resource downloads (references resources and users)
DELETE FROM resource_downloads;

-- 2b. Topic progress (references topics and users)
DELETE FROM topic_progress;

-- 2c. Video progress tied to old seeded lessons/tutorials
DELETE FROM learn_video_progress;

-- 2d. Saved content tied to old courses/tutorials/lessons
DELETE FROM learn_saved;

-- 2e. Course enrollments
DELETE FROM learn_course_enrollments;

-- 2f. Learn comments
DELETE FROM learn_comments;

-- 2g. Old seeded tutorials, lessons, courses
--     learn_lessons references learn_courses (cascade on delete) — delete courses first
DELETE FROM learn_lessons;
DELETE FROM learn_tutorials;
DELETE FROM learn_courses;

-- 2h. Earned badges (learning-derived — reset for new system)
DELETE FROM earned_badges;

-- 2i. Certificates (tied to old courses)
DELETE FROM certificates;

-- 2j. Curriculum content — child tables before parents
--     Questions reference topics + activities
DELETE FROM questions;
--     Resources reference topics
DELETE FROM resources;
--     Learning activities reference topics
DELETE FROM learning_activities;
--     Misconceptions reference topics + concepts
DELETE FROM misconceptions;
--     Concepts reference topics
DELETE FROM concepts;
--     Learning objectives reference topics
DELETE FROM learning_objectives;
--     Topics reference subjects
DELETE FROM topics;
--     Subjects (root)
DELETE FROM subjects;


-- ── STEP 3: DROP OLD TRIGGERS AND FUNCTIONS (if they exist) ───────────────
-- These were created by the old migrations and are no longer needed.

DROP TRIGGER IF EXISTS trigger_concept_progress_updated_at ON concept_progress;
DROP FUNCTION IF EXISTS update_concept_progress_updated_at();

DROP TRIGGER IF EXISTS trigger_challenge_sessions_updated_at ON challenge_sessions;
DROP FUNCTION IF EXISTS update_challenge_sessions_updated_at();


-- ── STEP 4: VERIFICATION QUERIES ─────────────────────────────────────────
-- Run these after COMMIT to confirm the cleanup.

-- Tables that must NOT exist:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'concept_progress', 'challenge_sessions',
--     'solo_concept_progress', 'checkpoint_answers', 'explanation_attempts',
--     'sync_sessions', 'sync_warmup_answers', 'sync_quiz_exchanges', 'sync_gaps',
--     'learning_sessions', 'session_teaching_exchanges', 'session_practice_answers',
--     'session_activity_results', 'study_rooms', 'room_materials'
--   );
-- Expected result: 0 rows.

-- Curriculum tables that must be EMPTY:
-- SELECT 'subjects'           AS tbl, COUNT(*) FROM subjects
-- UNION ALL SELECT 'topics',           COUNT(*) FROM topics
-- UNION ALL SELECT 'concepts',         COUNT(*) FROM concepts
-- UNION ALL SELECT 'learning_objectives', COUNT(*) FROM learning_objectives
-- UNION ALL SELECT 'misconceptions',   COUNT(*) FROM misconceptions
-- UNION ALL SELECT 'questions',        COUNT(*) FROM questions
-- UNION ALL SELECT 'resources',        COUNT(*) FROM resources
-- UNION ALL SELECT 'learn_courses',    COUNT(*) FROM learn_courses
-- UNION ALL SELECT 'learn_tutorials',  COUNT(*) FROM learn_tutorials;
-- Expected result: all counts = 0.

-- Users must be preserved:
-- SELECT COUNT(*) FROM users;
-- Expected result: > 0 (your user accounts remain).

COMMIT;

-- ============================================================
-- END OF CLEAN RESET
-- ============================================================
