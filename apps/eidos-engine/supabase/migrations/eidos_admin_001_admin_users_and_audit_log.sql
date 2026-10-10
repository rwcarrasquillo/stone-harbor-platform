-- SH-151 phase B1 — Eidos admin identity: allow-list + audit log tables.
--
-- Replaces the shared EIDOS_ADMIN_PASSWORD with per-admin Supabase Auth
-- accounts (email + password + TOTP). Supabase Auth owns credentials,
-- sessions and MFA factors (auth.users / auth.sessions / auth.mfa_factors).
-- These two tables add what Auth doesn't have:
--
--   eidos_admin_users      who is allowed into eidos-admin, and with what role.
--                          Being a valid Auth user is NOT enough; the admin
--                          app requires an active row here. Sign-ups stay
--                          closed; admins are invited by an owner.
--   eidos_admin_audit_log  append-only trail of admin logins and high-privilege
--                          actions. Created now, written to in phase B2.
--
-- Grants: the Eidos project grants ALL on new public tables to anon and
-- authenticated by default (see the existing eidos_* tables, which rely on
-- RLS alone). Here we REVOKE first and grant back only what is needed.

-- ---------------------------------------------------------------------------
-- eidos_admin_users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eidos_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.eidos_admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.eidos_admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.eidos_admin_users TO authenticated;
GRANT ALL ON TABLE public.eidos_admin_users TO service_role;

-- A signed-in user can read only their own row, and only while active. The
-- admin app uses this (with the user's own session) to decide whether the
-- account is allowed in; it never needs the service-role key for that check.
-- No INSERT/UPDATE/DELETE policy: only the service role (invites, disabling)
-- can change membership.
DROP POLICY IF EXISTS eidos_admin_users_select_own ON public.eidos_admin_users;
CREATE POLICY eidos_admin_users_select_own
  ON public.eidos_admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND disabled_at IS NULL);

-- ---------------------------------------------------------------------------
-- eidos_admin_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eidos_admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  -- SET NULL so the trail survives removal of an admin account.
  admin_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  event text NOT NULL,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_eidos_admin_audit_log_at
  ON public.eidos_admin_audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_eidos_admin_audit_log_admin
  ON public.eidos_admin_audit_log (admin_user_id, at DESC);

ALTER TABLE public.eidos_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role only: no browser or signed-in user reads or writes this.
REVOKE ALL ON TABLE public.eidos_admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.eidos_admin_audit_log TO service_role;
