-- Stone Harbor — DB test: rls_policies
--
-- Asserts that Row-Level Security is enabled on the tables that
-- carry member data, AND that the expected SELECT policies are
-- present. This guards against accidental policy drops that
-- would silently make member-private data globally readable.
--
-- We check a small, high-importance subset:
--   - journal_entries (private writing)
--   - member_page_views (analytics — admin-only reads)
--   - member_milestones (analytics)
--   - admin_accounts (admin identity table)

DO $$
DECLARE
  bad     text[];
  has_rls boolean;
  has_pol boolean;
  tbl     text;
  -- Tables that MUST have RLS enabled.
  required_rls text[] := ARRAY[
    'journal_entries',
    'member_page_views',
    'member_milestones',
    'admin_accounts'
  ];
BEGIN
  bad := ARRAY[]::text[];

  FOREACH tbl IN ARRAY required_rls LOOP
    SELECT c.relrowsecurity
    INTO   has_rls
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
      AND  c.relname = tbl;

    IF has_rls IS NULL THEN
      bad := bad || (tbl || ': table not found');
    ELSIF NOT has_rls THEN
      bad := bad || (tbl || ': RLS not enabled');
    END IF;
  END LOOP;

  -- Spot-check: member_page_views must have an admin SELECT policy.
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'member_page_views'
      AND  cmd        = 'SELECT'
  ) INTO has_pol;
  IF NOT has_pol THEN
    bad := bad || 'member_page_views: no SELECT policy';
  END IF;

  -- Spot-check: admin_accounts must have a SELECT policy.
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'admin_accounts'
      AND  cmd        = 'SELECT'
  ) INTO has_pol;
  IF NOT has_pol THEN
    bad := bad || 'admin_accounts: no SELECT policy';
  END IF;

  IF array_length(bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'fail: %', array_to_string(bad, '; ');
  END IF;
END $$;
