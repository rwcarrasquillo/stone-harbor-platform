-- admin_002_protected_groups.sql
--
-- Add an explicit `is_protected` flag to admin_groups so the
-- application can refuse to delete certain groups (today: Super
-- Admins) without relying on string matching on the group name.
--
-- The previous DELETE guard compared g.name === 'Super Admins'.
-- If an admin ever rename Super Admins to anything else, the
-- protection silently drops. With `is_protected`, the guard is
-- name-independent and survives renames.
--
-- Safe to run multiple times: ADD COLUMN IF NOT EXISTS + UPDATE.
-- No data loss.

ALTER TABLE public.admin_groups
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_groups.is_protected IS
  'When true, the application refuses to delete this group and refuses '
  'to remove the manage_admins permission from it. Today only Super '
  'Admins carries this flag; future protected groups (HIPAA-Auditors, '
  'Eidos-Engine-Operators) would also set it.';

-- Backfill: mark Super Admins as protected. WHERE clause makes
-- the UPDATE idempotent — running it after the row is already
-- protected is a no-op.
UPDATE public.admin_groups
   SET is_protected = true
 WHERE name = 'Super Admins'
   AND is_protected = false;
