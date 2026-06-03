-- Stone Harbor Admin — Phase 2 of media binding
--
-- Two changes that together make the member app able to
-- resolve its backgrounds from the catalog:
--
--   1. RLS: members (and even anon users on public pages)
--      can SELECT active, non-trashed media_assets. The
--      existing admin policy stays — it lets admins see
--      everything including trashed/inactive rows. PostgreSQL
--      RLS combines policies with OR, so admins see
--      everything and everyone else sees the active subset.
--
--   2. Seed the 4 images currently hardcoded in
--      app/dashboard/page.tsx as media_assets rows. Same
--      images, same order — so when the resolver lands and
--      the page reads from the catalog, the rotation
--      behaves identically. public_url uses the relative
--      /nature/... path because these files live in the
--      member app's /public folder, not in the admin-media
--      bucket. The catalog stores a string; relative paths
--      render fine in <img src> and CSS background-image.

drop policy if exists "anyone reads active media_assets"
  on public.media_assets;

create policy "anyone reads active media_assets"
  on public.media_assets
  for select
  to public
  using (is_active = true and deleted_at is null);

insert into public.media_assets (
  kind, area, label, storage_path, public_url, mime_type,
  is_active, position
)
select
  v.kind, v.area, v.label, v.storage_path, v.public_url,
  v.mime_type, true, v.position
from (values
  ('background', 'dashboard', 'Alpine lake — trees + mountains',
    '/nature/alpine-lake-trees-mountains.jpg',
    '/nature/alpine-lake-trees-mountains.jpg', 'image/jpeg', 0),
  ('background', 'dashboard', 'Sunrise mountain lake — icy rocks',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg', 'image/jpeg', 1),
  ('background', 'dashboard', 'Trees + lake + mountain — daytime',
    '/nature/trees-lake-mountain-daytime.jpg',
    '/nature/trees-lake-mountain-daytime.jpg', 'image/jpeg', 2),
  ('background', 'dashboard', 'Lake + mountain — Alps',
    '/nature/lake-mountain-alps.jpg',
    '/nature/lake-mountain-alps.jpg', 'image/jpeg', 3)
) as v(kind, area, label, storage_path, public_url, mime_type, position)
where not exists (
  select 1
  from public.media_assets m
  where m.storage_path = v.storage_path
);
