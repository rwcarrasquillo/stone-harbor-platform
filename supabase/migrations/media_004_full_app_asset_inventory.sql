-- Stone Harbor Admin — full app asset inventory
--
-- Seeds every hardcoded background image and audio file
-- referenced by member-app pages as a media_assets row, so
-- the /media admin page reflects reality even before each
-- page is wired to consume from the catalog (Phase 3+).
--
-- One row per (storage_path, area) combination. The same
-- file CAN appear in multiple areas (e.g., alpine-lake
-- is in dashboard, meditation, and start-here) — each
-- placement is its own pool member.
--
-- All seeded as is_active=true so they appear in the
-- default /media view. Positions reflect the order in the
-- existing hardcoded arrays so the rotation behavior stays
-- identical when each page is wired to the catalog.
--
-- Idempotent via the not-exists guard on (storage_path,
-- area). Re-running won't duplicate.

insert into public.media_assets (
  kind, area, label, storage_path, public_url, mime_type,
  is_active, position
)
select
  v.kind, v.area, v.label, v.storage_path, v.public_url,
  v.mime_type, true, v.position
from (values
  -- MEDITATION (8 backgrounds + 1 audio)
  --
  -- Mirrors BREATH_IMAGES in app/meditation/page.tsx.
  -- Includes the two legacy fallback PNGs (calm-lake,
  -- mountain-dawn) at the end so the catalog matches what
  -- the page actually cycles through today.
  ('background', 'meditation', 'Misty forest — sunrise soft light',
    '/nature/misty-forest-sunrise-soft-light.jpg',
    '/nature/misty-forest-sunrise-soft-light.jpg', 'image/jpeg', 0),
  ('background', 'meditation', 'Alpine lake — trees + mountains',
    '/nature/alpine-lake-trees-mountains.jpg',
    '/nature/alpine-lake-trees-mountains.jpg', 'image/jpeg', 1),
  ('background', 'meditation', 'Sunrise mountain lake — icy rocks',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg', 'image/jpeg', 2),
  ('background', 'meditation', 'Misty forest — warm sunlight',
    '/nature/misty-forest-warm-sunlight.jpg',
    '/nature/misty-forest-warm-sunlight.jpg', 'image/jpeg', 3),
  ('background', 'meditation', 'Coastal cliff — serene sunset',
    '/nature/coastal-cliff-serene-sunset.jpg',
    '/nature/coastal-cliff-serene-sunset.jpg', 'image/jpeg', 4),
  ('background', 'meditation', 'Lake + mountain — Alps',
    '/nature/lake-mountain-alps.jpg',
    '/nature/lake-mountain-alps.jpg', 'image/jpeg', 5),
  ('background', 'meditation', 'Calm lake (legacy fallback)',
    '/calm-lake.png',
    '/calm-lake.png', 'image/png', 6),
  ('background', 'meditation', 'Mountain dawn (legacy fallback)',
    '/mountain-dawn.png',
    '/mountain-dawn.png', 'image/png', 7),
  ('audio', 'meditation', 'Shimmering breeze — ambient loop',
    '/shimmering-breeze.mp3',
    '/shimmering-breeze.mp3', 'audio/mpeg', 0),

  -- LOGIN (3 backgrounds)
  --
  -- Mirrors the images array in app/[locale]/login/page.tsx.
  ('background', 'login', 'Coastal cliff — serene sunset',
    '/nature/coastal-cliff-serene-sunset.jpg',
    '/nature/coastal-cliff-serene-sunset.jpg', 'image/jpeg', 0),
  ('background', 'login', 'Ocean cliff — foggy day',
    '/nature/ocean-cliff-foggy-day.jpg',
    '/nature/ocean-cliff-foggy-day.jpg', 'image/jpeg', 1),
  ('background', 'login', 'Misty forest — sunrise soft light',
    '/nature/misty-forest-sunrise-soft-light.jpg',
    '/nature/misty-forest-sunrise-soft-light.jpg', 'image/jpeg', 2),

  -- START-HERE (12 unique backgrounds + same audio)
  ('background', 'start-here', 'Alpine lake — trees + mountains',
    '/nature/alpine-lake-trees-mountains.jpg',
    '/nature/alpine-lake-trees-mountains.jpg', 'image/jpeg', 0),
  ('background', 'start-here', 'Sunrise mountain lake — icy rocks',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg',
    '/nature/sunrise-mountain-lake-icy-rocks.jpg', 'image/jpeg', 1),
  ('background', 'start-here', 'Lake + mountain — Alps',
    '/nature/lake-mountain-alps.jpg',
    '/nature/lake-mountain-alps.jpg', 'image/jpeg', 2),
  ('background', 'start-here', 'Misty forest — sunrise soft light',
    '/nature/misty-forest-sunrise-soft-light.jpg',
    '/nature/misty-forest-sunrise-soft-light.jpg', 'image/jpeg', 3),
  ('background', 'start-here', 'Misty forest — dark trees + fog',
    '/nature/misty-forest-dark-trees-fog.jpg',
    '/nature/misty-forest-dark-trees-fog.jpg', 'image/jpeg', 4),
  ('background', 'start-here', 'Misty forest — warm sunlight',
    '/nature/misty-forest-warm-sunlight.jpg',
    '/nature/misty-forest-warm-sunlight.jpg', 'image/jpeg', 5),
  ('background', 'start-here', 'Coastal cliff — serene sunset',
    '/nature/coastal-cliff-serene-sunset.jpg',
    '/nature/coastal-cliff-serene-sunset.jpg', 'image/jpeg', 6),
  ('background', 'start-here', 'Ocean cliff — foggy day',
    '/nature/ocean-cliff-foggy-day.jpg',
    '/nature/ocean-cliff-foggy-day.jpg', 'image/jpeg', 7),
  ('background', 'start-here', 'Coastal Portugal — beach + cliffs',
    '/nature/coastal-portugal-beach-cliffs.jpg',
    '/nature/coastal-portugal-beach-cliffs.jpg', 'image/jpeg', 8),
  ('background', 'start-here', 'Trees + lake + mountain — daytime',
    '/nature/trees-lake-mountain-daytime.jpg',
    '/nature/trees-lake-mountain-daytime.jpg', 'image/jpeg', 9),
  ('background', 'start-here', 'Small town — lake + mountains',
    '/nature/small-town-lake-mountains.jpg',
    '/nature/small-town-lake-mountains.jpg', 'image/jpeg', 10),
  ('background', 'start-here', 'Ocean cliff — Santa Cruz',
    '/nature/ocean-cliff-santa-cruz.jpg',
    '/nature/ocean-cliff-santa-cruz.jpg', 'image/jpeg', 11),
  ('audio', 'start-here', 'Shimmering breeze — ambient loop',
    '/shimmering-breeze.mp3',
    '/shimmering-breeze.mp3', 'audio/mpeg', 0),

  -- JOURNAL (same audio — its only ambient media)
  ('audio', 'journal', 'Shimmering breeze — ambient loop',
    '/shimmering-breeze.mp3',
    '/shimmering-breeze.mp3', 'audio/mpeg', 0)
) as v(kind, area, label, storage_path, public_url, mime_type, position)
where not exists (
  select 1
  from public.media_assets m
  where m.storage_path = v.storage_path
    and (m.area is not distinct from v.area)
);
