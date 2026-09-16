-- Migration: Learn System v2
-- Add checkpoint_data and curriculum_snapshot columns to concept_progress
-- Safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE concept_progress
  ADD COLUMN IF NOT EXISTS checkpoint_data JSONB,
  ADD COLUMN IF NOT EXISTS curriculum_snapshot JSONB;

-- Index for faster queries on user/concept pairs
CREATE INDEX IF NOT EXISTS idx_concept_progress_user_concept
  ON concept_progress(user_id, concept_id);

-- Index for stage-based queries (e.g. "all concepts at checkpoint stage")
CREATE INDEX IF NOT EXISTS idx_concept_progress_user_stage
  ON concept_progress(user_id, current_stage);
