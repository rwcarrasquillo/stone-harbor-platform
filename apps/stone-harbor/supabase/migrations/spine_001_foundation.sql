-- Spine Ship 1 — foundation slice (SH-109)
-- Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Spine_Ship1_Foundation_Design.md
-- Parent architecture: stone-harbor-docs/stone-harbor/Stone_Harbor_App_Spine_Design.md

BEGIN;

------------------------------------------------------------------
-- 1. profiles additions
------------------------------------------------------------------

ALTER TABLE profiles ADD COLUMN current_roadmap_step_id uuid
  REFERENCES roadmap_steps(id) ON DELETE SET NULL;
  -- NULL = member hasn't been placed on the path yet.
  -- Dashboard falls back to rooms-strip-primary layout in that state.

ALTER TABLE profiles ADD COLUMN current_step_entered_at timestamptz;
  -- Timestamp of the last transition INTO the current step.
  -- Ship 3's soft time-based witnessing reads this.

CREATE INDEX profiles_current_roadmap_step_id_idx
  ON profiles(current_roadmap_step_id)
  WHERE current_roadmap_step_id IS NOT NULL;

------------------------------------------------------------------
-- 2. app_settings feature flag
------------------------------------------------------------------

ALTER TABLE app_settings ADD COLUMN spine_enabled boolean
  NOT NULL DEFAULT false;

COMMIT;
