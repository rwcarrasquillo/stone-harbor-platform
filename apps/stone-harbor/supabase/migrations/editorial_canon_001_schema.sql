-- ============================================================================
-- editorial_canon_001_schema.sql
--
-- Stone Harbor — SH-85 Phase 2 schema for the agentic editorial system.
--
-- Applied to production on 2026-06-23 via Supabase MCP from Cowork session
-- (during the same session that drafted Stone_Harbor_Editorial_Canon.md).
-- This file codifies that schema state so the repo source-of-truth matches
-- production.
--
-- Companion seed file: editorial_canon_002_seed_angles.sql (deferred — to
-- be authored by reading the 24 canon angle rows from production and
-- emitting them with proper apostrophe handling. Until then, fresh DBs
-- need to be re-seeded from the production export or from the
-- Stone_Harbor_Editorial_Canon.md document.)
--
-- Two tables:
--   1. editorial_canon_angles — 24 angles (8 per pillar). Each holds the
--      harbor framing, therapeutic substrate (Writer priming), and
--      embodiment instruction. Language-agnostic — embodiment instructions
--      describe the move; the Writer generates in the target language at
--      call time.
--
--   2. editorial_assignments — Strategist's coverage log. Each generation
--      attempt creates one row tagged with angle_id + language. Strategist
--      picks the next angle by querying for the angle with the fewest
--      successful assignments for the requested language.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.editorial_canon_angles (
  id text PRIMARY KEY,  -- 'C-1' through 'C-8', 'CA-1' through 'CA-8', 'S-1' through 'S-8'
  pillar text NOT NULL CHECK (pillar IN ('clarity', 'calm', 'strength')),
  angle_name text NOT NULL,
  harbor_framing text NOT NULL,
  therapeutic_substrate text NOT NULL,
  embodiment_instruction text NOT NULL,
  display_order int NOT NULL,
  canon_version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canon_angles_pillar_active
  ON public.editorial_canon_angles (pillar, is_active);

COMMENT ON TABLE public.editorial_canon_angles IS
  'SH-83 editorial canon. Each angle defines a distinct conceptual territory within a pillar with its therapeutic substrate (Writer priming — NEVER named in letter) and embodiment instruction (how to encode literarily). Source of truth: stone-harbor-docs/stone-harbor/Stone_Harbor_Editorial_Canon.md.';

CREATE TABLE IF NOT EXISTS public.editorial_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  angle_id text NOT NULL REFERENCES public.editorial_canon_angles(id),
  language text NOT NULL CHECK (language IN ('en', 'es')),
  post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false,
  failure_reason text,
  scorer_overall numeric(4, 2),
  scorer_therapeutic_depth int
);

-- Hot path for Strategist: "find angle with fewest successful assignments for language X"
CREATE INDEX IF NOT EXISTS idx_assignments_strategist
  ON public.editorial_assignments (angle_id, language, succeeded);

-- Lookup for "what angle is this post tied to"
CREATE INDEX IF NOT EXISTS idx_assignments_by_post
  ON public.editorial_assignments (post_id)
  WHERE post_id IS NOT NULL;

COMMENT ON TABLE public.editorial_assignments IS
  'SH-85 Strategist coverage log. One row per generation attempt. Strategist queries successful counts per (angle_id, language) to pick the next under-covered angle. Set succeeded=true optimistically at insert and revert on final scoring failure.';

-- Admin settings: library completion flag (so cron can noop when target hit)
ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS blog_library_complete boolean NOT NULL DEFAULT false;

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS blog_library_target_per_angle int NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.admin_settings.blog_library_complete IS
  'When true, generate-blog-posts logs "library complete, skipping" and returns immediately. Set after the initial canon library has been built and reviewed (SH-86).';

COMMENT ON COLUMN public.admin_settings.blog_library_target_per_angle IS
  'Target number of successful letters per (angle, language). Strategist stops assigning new generations to an angle once it has this many succeeded assignments. Default 2 = 96 letters total target across 24 angles x 2 languages.';

-- RLS: admin-only
ALTER TABLE public.editorial_canon_angles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canon_angles: admins read" ON public.editorial_canon_angles;
CREATE POLICY "canon_angles: admins read"
  ON public.editorial_canon_angles
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_accounts a WHERE a.user_id = auth.uid()));

DROP POLICY IF EXISTS "canon_angles: admins write" ON public.editorial_canon_angles;
CREATE POLICY "canon_angles: admins write"
  ON public.editorial_canon_angles
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_accounts a WHERE a.user_id = auth.uid()));

DROP POLICY IF EXISTS "assignments: admins read" ON public.editorial_assignments;
CREATE POLICY "assignments: admins read"
  ON public.editorial_assignments
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_accounts a WHERE a.user_id = auth.uid()));

DROP POLICY IF EXISTS "assignments: admins write" ON public.editorial_assignments;
CREATE POLICY "assignments: admins write"
  ON public.editorial_assignments
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_accounts a WHERE a.user_id = auth.uid()));
