-- profile_001_known_languages.sql
-- Applied 2026-05-31 via Supabase MCP to project fbqcmtcvgijlemfpncay.
-- Captured here for reproducibility + future-environment replay.
--
-- Stone Harbor — known_languages on profiles.
--
-- Multi-select list of languages the MEMBER speaks. Distinct from
-- preferred_language (which drives the UI display). Use cases:
--   - Future brotherhood pairing (match a Spanish-Mandarin speaker
--     with another)
--   - Admin demographic insights
--   - Eventual content-surface filtering (read in any language the
--     member knows)
--
-- Stored as a text[] of lowercase language slugs (english, spanish,
-- mandarin, …). Default ['english'] so existing members aren't
-- blank. The /welcome profile editor offers a multi-select with the
-- top US-spoken languages.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS known_languages text[]
  DEFAULT ARRAY['english']::text[];

COMMENT ON COLUMN public.profiles.known_languages IS
  'Languages the member speaks (member-managed). Distinct from preferred_language which drives the UI display.';
