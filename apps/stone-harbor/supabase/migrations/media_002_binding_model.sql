-- Stone Harbor Admin — media binding model
--
-- Two columns added to media_assets so pages in the member
-- app can resolve "what backgrounds should I render?" via a
-- single query:
--
--   SELECT public_url
--   FROM media_assets
--   WHERE kind = 'background'
--     AND area = 'dashboard'
--     AND is_active = true
--     AND deleted_at IS NULL
--   ORDER BY position ASC;
--
-- is_active toggles whether an asset participates in its
-- area's pool. Default TRUE because the dominant flow is
-- "upload-and-use" — admins very rarely want to upload-but-
-- hide. The /media UI exposes a per-card toggle for the
-- exceptions.
--
-- position orders assets within an (area, kind) pool. Lower
-- values render first (or, for rotation pools, appear earlier
-- in the cycle). Default 0; the admin re-orders with up/down
-- buttons. Ties break on created_at DESC so a freshly
-- uploaded asset always shows up first within its position
-- bucket if the admin doesn't reorder.

alter table public.media_assets
  add column if not exists is_active boolean not null default true,
  add column if not exists position integer not null default 0;

-- Index for the resolver query. Covers the hot path: filter
-- by kind+area+active, order by position. deleted_at is
-- excluded from the index because it's already covered by
-- the partial-index pattern other pages use; the query
-- planner will combine it with media_assets_deleted_at_idx.
create index if not exists media_assets_pool_idx
  on public.media_assets (kind, area, is_active, position)
  where deleted_at is null;
