-- Stone Harbor Admin — media library hardening
--
-- Three changes in one atomic migration:
--
--   1. Soft-delete column on media_assets so removing an
--      asset from the library doesn't immediately break any
--      page that's hardcoded its public_url. Routes flip
--      deleted_at instead of dropping the row; restoration is
--      one column flip away during the retention window. A
--      future cron can hard-delete rows older than 30 days.
--
--   2. CHECK constraint on media_assets.kind. The route
--      validates the same set, but the route isn't the only
--      possible write path (RLS-permitted inserts, future
--      cron, manual SQL, MCP). Defense in depth.
--
--   3. Mint the new "manage_media" permission and grant it to
--      Super Admins so the existing super-admin can manage
--      media immediately. This is the first permission minted
--      using the catalog flexibility shipped earlier today —
--      hand-written here instead of via the UI so the gate is
--      in place when the API routes start checking for it. We
--      explicitly set created_by = NULL (treating this as a
--      seeded row, since it ships alongside the route change).

alter table public.media_assets
  add column if not exists deleted_at timestamptz null;

-- Idempotent CHECK creation: drop first if it already exists.
alter table public.media_assets
  drop constraint if exists media_assets_kind_check;
alter table public.media_assets
  add constraint media_assets_kind_check
  check (kind in ('background', 'audio', 'other'));

-- Index on deleted_at — the active-only list query filters
-- by `deleted_at is null` on every page load.
create index if not exists media_assets_deleted_at_idx
  on public.media_assets (deleted_at);

-- Mint the new permission. Description matches the tone of
-- the seed permissions (plain English, "what does this let
-- you do?").
insert into public.admin_permissions (key, label, category, description, created_by)
values (
  'manage_media',
  'Manage media library',
  'content',
  'Upload, edit, soft-delete, and restore assets in the admin media library.',
  null
)
on conflict (key) do nothing;

-- Grant manage_media to every group flagged is_protected.
-- Today that's just Super Admins, but the dynamic SELECT
-- means any future protected group inherits it without a
-- migration follow-up. Use a not-exists guard so re-running
-- the migration is idempotent (the (group_id, permission_key)
-- PK would otherwise raise).
insert into public.admin_group_permissions (group_id, permission_key)
select g.id, 'manage_media'
from public.admin_groups g
where g.is_protected = true
  and not exists (
    select 1
    from public.admin_group_permissions agp
    where agp.group_id = g.id
      and agp.permission_key = 'manage_media'
  );
