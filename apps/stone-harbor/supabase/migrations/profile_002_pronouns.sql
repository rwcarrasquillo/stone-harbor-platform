-- profile_002_pronouns.sql
-- Stone Harbor — pronouns on profiles.
--
-- Added for the /profile surface (split of /welcome). The old /welcome
-- editor never exposed pronouns and no column existed; the new profile
-- surface offers an optional free-text pronouns field, so the column is
-- introduced here.
--
-- Free text, nullable, member-managed. Optional in the UI ("Pronouns
-- (optional)"). No constraint or enum — members phrase this however
-- they want.
--
-- IMPORTANT: apply this migration before (or together with) the deploy
-- that ships app/profile/page.tsx. The profile save upserts `pronouns`;
-- if the column is missing at runtime the whole profile save fails
-- (PostgREST rejects the unknown column), the same failure mode the
-- /vent `body`-column incident hit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pronouns text;

COMMENT ON COLUMN public.profiles.pronouns IS
  'Optional free-text pronouns (member-managed). Surfaced on /profile.';
