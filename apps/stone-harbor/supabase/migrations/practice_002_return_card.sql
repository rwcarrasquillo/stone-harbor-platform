-- /practice surface — return card 24hr window tracking (SH-135)
-- Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Practice_Surface_Design.md (v0.2 §4.2)
--
-- PR 2 of 3. Additive-only. Adds one nullable column used by the
-- getReturnCardEligibility() helper to enforce the "once per 24hr window"
-- rule on the return card (design brief §4.2 step 3).
--
-- Why a DB column and not sessionStorage/cookie: cross-device reliability.
-- If a member sees the card on his phone at 8am then opens a laptop at 2pm,
-- client-only tracking re-shows the card. The DB is the source of truth.
--
-- NO RLS work here, deliberately. Same rationale as practice_001_schema.sql
-- (SH-134), re-verified against the live database before writing: profiles
-- carries "Users can update own profile" (UPDATE, authenticated,
-- auth.uid() = id, no column list). The new column is readable + writable
-- by exactly the right caller the moment it exists.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS return_card_last_shown_at timestamptz;

COMMENT ON COLUMN public.profiles.return_card_last_shown_at IS
  'Timestamp when the /practice return card was last shown to this member '
  '(SH-135). Used by getReturnCardEligibility to enforce the 24hr window so '
  'the card renders once per 24hr per member, independent of device. '
  'NOT a log — one mutable timestamp, no history.';

COMMIT;
