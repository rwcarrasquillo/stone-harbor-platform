-- Eidos-for-Therapists — schema foundation (SH-132)
-- Design brief: stone-harbor-docs/eidos/Stone_Harbor_Eidos_For_Therapists_Design.md (v0.2 §9)
--
-- PR 1 of 5. All additive. The feature flag defaults false, so applying
-- this migration changes nothing a member, therapist, or admin can see
-- beyond one empty admin list view.
--
-- Precedent: keepers_001_schema.sql (SH-108) for the BEGIN/COMMIT +
-- section-divider + RLS block idioms; spine_001_foundation.sql (SH-109)
-- for the app_settings boolean flag.

BEGIN;

------------------------------------------------------------------
-- 1. therapist_accounts — one row per therapist user
------------------------------------------------------------------

CREATE TABLE public.therapist_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_name         text,
  license_state         text,  -- US state code (2 char) — validated app-side, not enforced in DB
  license_type          text
    CHECK (license_type IN ('LCSW', 'LPC', 'LMFT', 'PSYC', 'OTHER')),
  stripe_customer_id    text UNIQUE,
  subscription_status   text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'incomplete')),
  trial_started_at      timestamptz NOT NULL DEFAULT now(),
  trial_ends_at         timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  current_period_end    timestamptz,
  canceled_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_therapist_accounts_stripe_customer
  ON public.therapist_accounts(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX idx_therapist_accounts_subscription_status
  ON public.therapist_accounts(subscription_status);

-- The admin list view (and PR 5's metrics) order by created_at DESC.
CREATE INDEX idx_therapist_accounts_created_at
  ON public.therapist_accounts(created_at DESC);

------------------------------------------------------------------
-- 2. therapist_client_invitations — one row per client invite
------------------------------------------------------------------

CREATE TABLE public.therapist_client_invitations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id         uuid NOT NULL REFERENCES public.therapist_accounts(id) ON DELETE CASCADE,
  client_email         text NOT NULL,
  client_first_name    text,
  invitation_token     text NOT NULL UNIQUE,  -- URL-safe, 32-char (app-generated)
  sent_at              timestamptz NOT NULL DEFAULT now(),
  accepted_at          timestamptz,  -- client clicked signup link
  completed_at         timestamptz,  -- client finished Eidos assessment
  client_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_therapist_client_invitations_therapist
  ON public.therapist_client_invitations(therapist_id, sent_at DESC);

-- Redundant with the UNIQUE constraint's implicit index on
-- invitation_token, but kept explicit so the /join/{token} lookup
-- path is obvious to the next reader.
CREATE INDEX idx_therapist_client_invitations_token
  ON public.therapist_client_invitations(invitation_token);

CREATE INDEX idx_therapist_client_invitations_client_user
  ON public.therapist_client_invitations(client_user_id)
  WHERE client_user_id IS NOT NULL;

------------------------------------------------------------------
-- 3. therapist_client_relationships — join table
------------------------------------------------------------------

CREATE TABLE public.therapist_client_relationships (
  therapist_id     uuid NOT NULL REFERENCES public.therapist_accounts(id) ON DELETE CASCADE,
  client_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_id    uuid REFERENCES public.therapist_client_invitations(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (therapist_id, client_user_id)
);

CREATE INDEX idx_therapist_client_relationships_client
  ON public.therapist_client_relationships(client_user_id);

------------------------------------------------------------------
-- 4. RLS policies
------------------------------------------------------------------
-- Every table is RLS-enabled. The service role bypasses RLS, which is
-- how the admin surfaces and the Stripe webhook handlers read/write —
-- so there are deliberately NO admin-facing policies here.
--
-- auth.uid() is wrapped in a scalar subquery — (SELECT auth.uid()) —
-- so Postgres evaluates it once per statement instead of once per row.

ALTER TABLE public.therapist_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_client_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_client_relationships ENABLE ROW LEVEL SECURITY;

-- therapist_accounts: therapist can read + update own row only.
DROP POLICY IF EXISTS therapist_accounts_read_own ON public.therapist_accounts;
CREATE POLICY therapist_accounts_read_own
  ON public.therapist_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS therapist_accounts_update_own ON public.therapist_accounts;
CREATE POLICY therapist_accounts_update_own
  ON public.therapist_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No INSERT policy for authenticated users — therapist_accounts rows are
-- created server-side after Stripe checkout via the service role.

-- therapist_client_invitations: therapist can CRUD their own invitations.
DROP POLICY IF EXISTS therapist_client_invitations_all_own
  ON public.therapist_client_invitations;
CREATE POLICY therapist_client_invitations_all_own
  ON public.therapist_client_invitations
  FOR ALL
  TO authenticated
  USING (
    therapist_id IN (
      SELECT id FROM public.therapist_accounts WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    therapist_id IN (
      SELECT id FROM public.therapist_accounts WHERE user_id = (SELECT auth.uid())
    )
  );

-- Invitation redemption at /join/{token} happens BEFORE the client has
-- an account, so the lookup cannot be an authenticated read.
--
-- NOTE (SH-132 finding): the brief's original policy granted anon SELECT
-- on every unaccepted, unexpired row — no token predicate — which makes
-- the whole pending-invitation list (client_email, client_first_name,
-- and every live invitation_token) readable by any anonymous caller.
-- That is a PHI-adjacent enumeration leak and it would have shipped a
-- token-guessing bypass. Redemption is therefore served by a
-- SECURITY DEFINER lookup function keyed on the token instead, and no
-- anon SELECT policy exists on this table.
--
-- The function returns only what /join/{token} needs to render its
-- welcome screen. It never returns the token, the client_email, or any
-- other invitation's row.
CREATE OR REPLACE FUNCTION public.therapist_invitation_by_token(token text)
RETURNS TABLE (
  id                uuid,
  therapist_id      uuid,
  practice_name     text,
  client_first_name text,
  expires_at        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    i.id,
    i.therapist_id,
    t.practice_name,
    i.client_first_name,
    i.expires_at
  FROM public.therapist_client_invitations i
  JOIN public.therapist_accounts t ON t.id = i.therapist_id
  WHERE i.invitation_token = token
    AND i.accepted_at IS NULL
    AND i.expires_at > now();
$$;

COMMENT ON FUNCTION public.therapist_invitation_by_token(text) IS
  'Token-keyed invitation lookup for the unauthenticated /join/{token} '
  'flow. SECURITY DEFINER so it can read past RLS, but it returns at '
  'most the single row whose token was supplied and never echoes the '
  'token or client_email back. Replaces a blanket anon SELECT policy '
  'that would have exposed every pending invitation (SH-132).';

REVOKE ALL ON FUNCTION public.therapist_invitation_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.therapist_invitation_by_token(text) TO anon, authenticated;

-- therapist_client_relationships: therapist reads own; client reads own.
DROP POLICY IF EXISTS therapist_client_relationships_read_therapist
  ON public.therapist_client_relationships;
CREATE POLICY therapist_client_relationships_read_therapist
  ON public.therapist_client_relationships
  FOR SELECT
  TO authenticated
  USING (
    therapist_id IN (
      SELECT id FROM public.therapist_accounts WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS therapist_client_relationships_read_client
  ON public.therapist_client_relationships;
CREATE POLICY therapist_client_relationships_read_client
  ON public.therapist_client_relationships
  FOR SELECT
  TO authenticated
  USING (client_user_id = (SELECT auth.uid()));

-- INSERT/UPDATE/DELETE for relationships happens server-side via service role
-- during invitation redemption + subscription cancellation. No client-side policy.

------------------------------------------------------------------
-- 5. Feature flag on app_settings singleton
------------------------------------------------------------------
-- Mirrors keepers_enabled (SH-108), spine_enabled (SH-109),
-- spine_content_enabled (SH-120).

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS eidos_therapists_enabled boolean NOT NULL DEFAULT false;

------------------------------------------------------------------
-- 6. Admin permission — manage_therapists
------------------------------------------------------------------
-- Seeded here rather than minted through /admins/permissions: all 14
-- existing catalog rows carry created_by IS NULL, i.e. every permission
-- this platform has ever had arrived by seed. The UI path exists for
-- ad-hoc permissions, not for ones a shipped route depends on.
--
-- 'eidos' is a new category. The catalog UI groups by category
-- dynamically (Map built from the rows themselves) and the create form
-- takes free text, so a new category needs no code change. It gives
-- PR 5's /eidos/therapists/[id] and /eidos/metrics a home.

INSERT INTO public.admin_permissions (key, label, category, description)
VALUES (
  'manage_therapists',
  'Manage Therapists',
  'eidos',
  'View + manage Eidos-for-Therapists accounts, subscriptions, and support actions.'
)
ON CONFLICT (key) DO NOTHING;

-- Grant to Super Admins.
--
-- NOTE (SH-132 finding): the brief (§12) and the shipping prompt (§4)
-- both say "Founders group". No such group exists — admin_groups holds
-- exactly Content Editors, Moderators, and Super Admins, and Super
-- Admins (is_protected) is the only one with any members. Written as
-- specified, the grant would have matched zero rows and silently
-- granted the permission to nobody, leaving /eidos/therapists
-- unreachable for every human on the platform.
--
-- The assertion below is deliberate: if the target group is ever
-- renamed, this migration fails loudly instead of no-op'ing.
DO $$
DECLARE
  target_group_id uuid;
BEGIN
  SELECT id INTO target_group_id
    FROM public.admin_groups
   WHERE name = 'Super Admins';

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION
      'eidos_therapists_001: no admin_groups row named "Super Admins" — '
      'refusing to grant manage_therapists to nobody. Resolve the target '
      'group before applying.';
  END IF;

  INSERT INTO public.admin_group_permissions (group_id, permission_key)
  VALUES (target_group_id, 'manage_therapists')
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
