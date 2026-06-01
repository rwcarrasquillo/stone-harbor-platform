-- Stone Harbor Admin — admin_permissions audit trail
--
-- The CRUD UI on /admins/permissions lets any admin with
-- manage_admins create new permission rows. Two new columns
-- capture the audit trail:
--
--   created_at  — when this permission row was minted
--   created_by  — admin_accounts.user_id of the minter, or
--                 NULL for the original 13 seeded permissions
--                 (so a NULL created_by distinguishes seeded
--                 rows from UI-minted ones without needing an
--                 is_system flag — see lib/permissionScan.ts
--                 for the "is this referenced in code?"
--                 derivation that decides deletability).
--
-- We deliberately do NOT add an is_system / is_locked column.
-- Whether a permission is safe to delete is a function of code
-- references, not a flag, so the deletion gate runs off a live
-- scan instead of a stored boolean. Otherwise the flag and the
-- code can silently disagree (delete-safe in the flag, still
-- referenced in code → routes 500 in prod).

alter table public.admin_permissions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid null
    references public.admin_accounts(user_id) on delete set null;

-- The 13 seeded rows already exist with the default created_at
-- = now() from the alter (Postgres applies the default to
-- existing rows in this alter form). created_by stays NULL for
-- all of them, which the UI uses as "seeded, no minter recorded."
