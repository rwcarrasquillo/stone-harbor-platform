-- profile_002_rollback.sql
-- Reverses profile_002_settle_in.sql by dropping the two settle-in timestamp
-- columns. Safe to run if the columns are absent (IF EXISTS guards).

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS settle_in_completed_at,
  DROP COLUMN IF EXISTS settle_in_skipped_at;
