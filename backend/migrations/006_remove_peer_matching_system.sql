-- Migration: Remove peer matching system (subjects, match_requests)
-- Date: 2026-09-21
-- Description: Drop subjects_good_at, subjects_need_help, skill_level, language from users table
--              Drop match_requests table entirely
--              This removes the old subject-based peer matching system in favor of direct messaging

-- Step 1: Drop match_requests table (no foreign key constraints to worry about)
DROP TABLE IF EXISTS match_requests;

-- Step 2: Drop user columns related to peer matching
ALTER TABLE users DROP COLUMN IF EXISTS subjects_good_at;
ALTER TABLE users DROP COLUMN IF EXISTS subjects_need_help;
ALTER TABLE users DROP COLUMN IF EXISTS skill_level;
ALTER TABLE users DROP COLUMN IF EXISTS language;

-- Note: The ai_learning_profiles table and AI curriculum (subjects/topics/concepts) are preserved
-- Note: Chat, Challenge, and Learning Profile features remain intact
