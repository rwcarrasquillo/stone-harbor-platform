-- /practice surface — schema foundation (SH-134)
-- Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Practice_Surface_Design.md (v0.2 §6)
--
-- PR 1 of 3. All additive. The feature flag defaults false, so applying
-- this migration changes nothing a member can see beyond the new
-- /practice route being reachable (and that surface stays in its
-- empty state until the member declares a shape).
--
-- Precedent: spine_001_foundation.sql (SH-109) for the profiles column
-- addition + app_settings boolean flag. eidos_therapists_001_schema.sql
-- (SH-132) for the migration comment-header + IF NOT EXISTS style.
--
-- NO RLS work here, deliberately. Verified against the live database
-- before writing: profiles already carries "Users can update own
-- profile" (UPDATE, authenticated, auth.uid() = id, no column list) and
-- app_settings carries "app_settings_public_read" (SELECT, true). Both
-- new profiles columns and the new flag are therefore readable and
-- writable by exactly the right caller the moment they exist. Adding
-- policies here would duplicate live ones.

BEGIN;

------------------------------------------------------------------
-- 1. profiles.practice_shape — the member's declared shape
------------------------------------------------------------------
-- jsonb column holding three blocks + timestamps. Nullable; NULL is
-- "not declared" and is what drives the /practice onboarding view.
--
-- Shape:
--   { "morning_anchor": "walking",
--     "midday_touch": "one breath at the desk",
--     "evening_close": "journal + shower",
--     "declared_at": "2026-08-15T09:00:00Z",
--     "last_reshape_at": "2026-08-20T14:00:00Z" }
--
-- No CHECK constraint on the shape. The three blocks are the member's
-- own words and every one of them is optional (design brief §5) — a
-- constraint here would encode a rule the surface deliberately doesn't
-- have. lib/practice.ts owns the read/write contract.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS practice_shape jsonb;

COMMENT ON COLUMN public.profiles.practice_shape IS
  'The member''s declared /practice shape (SH-134): three optional '
  'free-text blocks (morning_anchor, midday_touch, evening_close) plus '
  'declared_at and last_reshape_at timestamps. NULL = never declared, '
  'which is the /practice empty state. Written via lib/practice.ts.';

------------------------------------------------------------------
-- 2. profiles.last_seen_at — for PR 2's absence detection
------------------------------------------------------------------
-- Written on authenticated page load with a 5-minute debounce (see
-- touchLastSeen in lib/practice.ts). PR 2 uses this to decide whether
-- to render the "shape has drifted" return card (threshold: 5 days,
-- PRACTICE_ABSENCE_THRESHOLD_DAYS).
--
-- Verified absent before adding: no column on profiles matching
-- %last% / %seen% / %visited% held this meaning. The nearest existing
-- column, current_step_entered_at (SH-109), tracks spine step
-- transitions, not presence.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Last authenticated page load, debounced to one write per 5 minutes '
  '(SH-134). Feeds PR 2''s 5-day-absence return card and PR 3''s '
  'presence band. NOT a tracking log — one mutable timestamp, no history.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at)
  WHERE last_seen_at IS NOT NULL;

------------------------------------------------------------------
-- 3. app_settings feature flag
------------------------------------------------------------------
-- Mirrors keepers_enabled (SH-108), spine_enabled (SH-109),
-- spine_content_enabled (SH-120), eidos_therapists_enabled (SH-132).
-- Verified: app_settings is the id=1 singleton and all four existing
-- flags are boolean NOT NULL DEFAULT false. This one matches.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS practice_enabled boolean NOT NULL DEFAULT false;

COMMIT;
