-- Stone Harbor — journal_001_editable_window
-- Applied: 2026-05-28 via Supabase MCP apply_migration
--
-- Adds two columns to support editable journal entries with a
-- time-limited (6-hour) edit window, while preserving the original
-- text immutably for tone signal / Eidos consumption.
--
-- Columns:
--   original_content — The immutable first save. Never updated after
--     row creation. This is the canonical "what the man wrote in the
--     moment" record. It feeds Eidos tone calibration and remains the
--     historical truth even when the member refines the rendered text.
--   edited_at — Null if the entry has never been edited; otherwise
--     timestamp of the last edit. Existence of a value drives the
--     "· edited" UI indicator next to the entry timestamp. Value is
--     reserved for future analytics (time-to-edit distributions, etc.).
--
-- Edit-window enforcement (6 hours from created_at) is in the
-- application layer (app/journal/page.tsx) rather than in RLS, because
-- time-relative windows are awkward to express in policies and the
-- application gives clearer user-facing error wording.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS original_content text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Backfill: existing rows treat their current content as the original.
-- These rows are necessarily older than 6 hours by the time this
-- migration runs, so they enter the new model as already-locked.
UPDATE public.journal_entries
SET original_content = content
WHERE original_content IS NULL;

-- All rows now have a value; enforce NOT NULL going forward. Every
-- future INSERT must explicitly populate original_content (the
-- application code mirrors `content` into `original_content` on
-- first save).
ALTER TABLE public.journal_entries
  ALTER COLUMN original_content SET NOT NULL;

-- Self-documenting comments visible in Supabase dashboard + pgAdmin.
COMMENT ON COLUMN public.journal_entries.original_content IS
  'Immutable first-save content. Never updated. Feeds Eidos tone signal and is the canonical historical record.';
COMMENT ON COLUMN public.journal_entries.edited_at IS
  'Timestamp of last edit (null if never edited). The application enforces a 6-hour edit window from created_at. Existence of a value drives the UI ''edited'' indicator.';
