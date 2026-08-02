-- Spine Ship 2A — bind editorial content to roadmap steps (SH-120)
-- Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Spine_Ship2_Editorial_Framework_Design.md
-- Parent: spine_001_foundation.sql (SH-109) added profiles.current_roadmap_step_id.
--
-- All additive. Every FK is nullable so today's untagged content stays
-- valid and keeps serving. The feature flag defaults false, so applying
-- this migration changes nothing a member can see.
--
-- WHAT THIS SHIP ACTUALLY ADAPTS ON (read before assuming step-tagging
-- is live): blog_posts and external_content both already carry a
-- `pillar` column whose values are exactly calm / clarity / strength —
-- the same taxonomy as roadmap_steps.stage. Ship 2A's surface
-- adaptations therefore key off the current step's STAGE via `pillar`,
-- which works today against 96 letters and 161 resources. The
-- roadmap_step_id column added here is the finer-grained hook that
-- Ship 2B's editorial pass populates; the app already prefers it over
-- the stage match wherever it is set (see lib/spine.ts).

BEGIN;

------------------------------------------------------------------
-- 1. roadmap_step_chapters — Move 3 hook, stays empty in Ship 2A
------------------------------------------------------------------
-- Chapters-within-steps. Created now so blog_posts.step_chapter_id has
-- something to reference and Move 3 lands as data rather than schema.
-- See §10 Q5 in the design brief.

CREATE TABLE IF NOT EXISTS public.roadmap_step_chapters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_step_id uuid NOT NULL REFERENCES public.roadmap_steps(id) ON DELETE CASCADE,
  position        int  NOT NULL,
  title           text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_step_chapters_step
  ON public.roadmap_step_chapters(roadmap_step_id, position);

-- RLS mirrors roadmap_steps exactly: authenticated members read the
-- path, admins write it. Without this the table ships RLS-disabled and
-- is world-readable the moment it holds rows.
ALTER TABLE public.roadmap_step_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roadmap_step_chapters_read ON public.roadmap_step_chapters;
CREATE POLICY roadmap_step_chapters_read
  ON public.roadmap_step_chapters
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS roadmap_step_chapters_admin_insert ON public.roadmap_step_chapters;
CREATE POLICY roadmap_step_chapters_admin_insert
  ON public.roadmap_step_chapters
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS roadmap_step_chapters_admin_update ON public.roadmap_step_chapters;
CREATE POLICY roadmap_step_chapters_admin_update
  ON public.roadmap_step_chapters
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS roadmap_step_chapters_admin_delete ON public.roadmap_step_chapters;
CREATE POLICY roadmap_step_chapters_admin_delete
  ON public.roadmap_step_chapters
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
    )
  );

------------------------------------------------------------------
-- 2. blog_posts — step + chapter binding
------------------------------------------------------------------
-- blog_posts is the Stone Harbor originals table (letters). Prod holds
-- 96 rows, all consumer='stone_harbor', all category='Recovery' —
-- there is no per-content-type category taxonomy today, so nothing in
-- this ship keys off `category`.
--
-- NOTE on publish state: post-i18n the authoritative publish flag is
-- blog_post_translations.is_published, NOT blog_posts.is_published
-- (which is vestigial). Any step-filtered query must join the
-- translation the way app/letters/page.tsx does.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS roadmap_step_id uuid
    REFERENCES public.roadmap_steps(id) ON DELETE SET NULL;

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS step_chapter_id uuid
    REFERENCES public.roadmap_step_chapters(id) ON DELETE SET NULL;

-- Partial index for the step-filter hot path (dashboard invitation,
-- letters). Excludes the NULL rows — which is all 96 of them until
-- Ship 2B tags content — so the index stays near-empty for now.
CREATE INDEX IF NOT EXISTS idx_blog_posts_step_partial
  ON public.blog_posts(roadmap_step_id)
  WHERE roadmap_step_id IS NOT NULL;

------------------------------------------------------------------
-- 3. app_settings feature flag
------------------------------------------------------------------
-- Mirrors spine_enabled (SH-109) and keepers_enabled (SH-108) on the
-- app_settings singleton (id=1). Separate from spine_enabled on
-- purpose: Ship 1's skeleton can stay on while Ship 2A's content
-- adaptation stays off until the editorial pass lands.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS spine_content_enabled boolean NOT NULL DEFAULT false;

COMMIT;
