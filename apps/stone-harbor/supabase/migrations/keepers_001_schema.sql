-- Lighthouse Keepers — Stripe patron integration (SH-108)
-- Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Lighthouse_Keepers_Design.md

BEGIN;

------------------------------------------------------------------
-- 1. profiles additions
------------------------------------------------------------------

ALTER TABLE profiles ADD COLUMN stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN patron_status text
  CHECK (patron_status IN ('none', 'active', 'past_due', 'canceled'))
  NOT NULL DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN patron_tier text
  CHECK (patron_tier IN ('tier_1', 'tier_2', 'tier_3'));
ALTER TABLE profiles ADD COLUMN patron_since timestamptz;
ALTER TABLE profiles ADD COLUMN patron_current_period_end timestamptz;
ALTER TABLE profiles ADD COLUMN patron_wall_visible boolean
  NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN patron_wall_name text;
  -- Optional override for the wall display name.
  -- If NULL: cascade display_name -> full_name -> Stripe billing first name.

CREATE UNIQUE INDEX profiles_stripe_customer_id_idx
  ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

------------------------------------------------------------------
-- 2. patron_events (audit history, one row per Stripe event)
------------------------------------------------------------------

CREATE TABLE patron_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Soft-delete on account deletion (Q5 resolution).
    -- The row survives with user_id NULL so financial reconciliation
    -- (amount + stripe_event_id + stripe_customer_id) is preserved.
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  amount_cents integer,
  currency text NOT NULL DEFAULT 'usd',
  tier text,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patron_events_user_id_created_at_idx
  ON patron_events(user_id, created_at DESC);
CREATE INDEX patron_events_stripe_customer_id_idx
  ON patron_events(stripe_customer_id);

ALTER TABLE patron_events ENABLE ROW LEVEL SECURITY;

-- Members read their own history.
CREATE POLICY patron_events_owner_read ON patron_events
  FOR SELECT USING (user_id = auth.uid());

-- Admins read everything. Service role writes everything.
-- (No policy needed for service role — bypasses RLS.)

------------------------------------------------------------------
-- 3. webhook_events (Stripe idempotency ledger)
------------------------------------------------------------------

CREATE TABLE webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'stripe',
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  handler_result jsonb
);

-- No RLS needed — writes only from service role, reads only from
-- service role (webhook handler + admin debugging).
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------
-- 4. visible_patrons view (wall of first-names — SECURITY DEFINER)
------------------------------------------------------------------

CREATE OR REPLACE VIEW visible_patrons
WITH (security_invoker = false) AS
SELECT
  p.id,
  COALESCE(
    p.patron_wall_name,
    -- First token of display_name
    NULLIF(split_part(p.display_name, ' ', 1), ''),
    -- First token of full_name
    NULLIF(split_part(p.full_name, ' ', 1), '')
  ) AS first_name,
  p.patron_since
FROM profiles p
WHERE p.patron_status = 'active'
  AND p.patron_wall_visible = true
  AND COALESCE(
    p.patron_wall_name,
    NULLIF(split_part(p.display_name, ' ', 1), ''),
    NULLIF(split_part(p.full_name, ' ', 1), '')
  ) IS NOT NULL;

-- Anyone can read the view (matches the /keepers public page).
GRANT SELECT ON visible_patrons TO anon, authenticated;

------------------------------------------------------------------
-- 5. app_settings — keepers_enabled feature flag
------------------------------------------------------------------

ALTER TABLE app_settings ADD COLUMN keepers_enabled boolean
  NOT NULL DEFAULT false;

------------------------------------------------------------------
-- 6. admin_settings — stripe_tax_enabled toggle
------------------------------------------------------------------

ALTER TABLE admin_settings ADD COLUMN stripe_tax_enabled boolean
  NOT NULL DEFAULT false;
  -- Toggle whether Stripe Checkout sessions are created with
  -- automatic_tax: { enabled: true }. Defaults off per Q6 resolution.
  -- Super-admin flips via admin UI after accountant sign-off.

COMMIT;
