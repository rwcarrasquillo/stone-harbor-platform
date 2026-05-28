-- Stone Harbor — journal_002_editable_title
-- Applied: 2026-05-28 via Supabase MCP apply_migration
--
-- Adds title preservation to mirror the content preservation
-- introduced in journal_001_editable_window. Same dual-storage
-- pattern: original_title captures the first-save title
-- (immutable), title becomes editable within the 6-hour edit window.
--
-- Why this is its own migration: the original journal_001 already
-- shipped (via MCP); modifying it after the fact would be lying
-- about history. Separate migration makes the audit trail accurate.
--
-- Nullable because titles themselves are nullable — members can
-- write untitled entries. When title is null at insert,
-- original_title is also null. The edit flow allows changing
-- null → text and vice versa.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS original_title text;

-- Backfill: existing rows treat their current title as the original.
-- Null titles stay null. After this UPDATE, original_title
-- accurately reflects what was stored at insert time for every row.
UPDATE public.journal_entries
SET original_title = title
WHERE original_title IS NULL AND title IS NOT NULL;

COMMENT ON COLUMN public.journal_entries.original_title IS
  'Immutable first-save title (nullable; null if entry was originally untitled). Never updated. Preserves the label the member chose in the moment, matching the original_content discipline.';
