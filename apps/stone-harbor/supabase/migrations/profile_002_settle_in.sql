-- profile_002_settle_in.sql
-- Adds two nullable timestamp columns to public.profiles to track the one-time
-- "settle-in" onboarding moment. Both NULL = member has neither completed nor
-- skipped settle-in (and should be redirected to /settle-in from the dashboard).
--
-- Pre-flight state (captured before apply):
--   profiles row_count = 1, column_count = 53, RLS enabled = true,
--   neither column previously existed.
--
-- Reversal: see profile_002_rollback.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS settle_in_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS settle_in_skipped_at   TIMESTAMPTZ NULL;
