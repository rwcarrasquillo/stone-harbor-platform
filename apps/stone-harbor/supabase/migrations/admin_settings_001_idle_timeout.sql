-- admin_settings_001_idle_timeout.sql
-- Adds two configurable session-timeout knobs to public.admin_settings for
-- SH-16 (admin app inactivity timeout + force logout on idle).
--
-- idle_timeout_minutes  — auto-logout after N minutes with no user interaction.
--                          Default 30. Warning modal at T-2min.
-- hard_lifetime_minutes — max session length regardless of activity. Default
--                          480 (8 hours). Forces re-auth at end of business day.
--
-- Both are stored in minutes so the /security UI can display them cleanly as
-- whole numbers without unit translation. The IdleWatchdog component converts
-- to ms at runtime.
--
-- Pre-flight state (captured 2026-06-06):
--   admin_settings row_count = 1 (id=1, single-row config table)
--   Neither column previously existed.
--
-- Reversal: see admin_settings_001_rollback.sql.

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes  INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS hard_lifetime_minutes INTEGER NOT NULL DEFAULT 480;

-- Sanity bounds at the DB level — a 0 or negative value would disable the
-- timeout entirely, which defeats the HIPAA-class protection. The /security
-- API route ALSO validates, but defense-in-depth.
ALTER TABLE public.admin_settings
  ADD CONSTRAINT admin_settings_idle_timeout_range
    CHECK (idle_timeout_minutes BETWEEN 1 AND 1440);

ALTER TABLE public.admin_settings
  ADD CONSTRAINT admin_settings_hard_lifetime_range
    CHECK (hard_lifetime_minutes BETWEEN 5 AND 1440);
