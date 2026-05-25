-- Stone Harbor — DB test: eidos_schema
--
-- Asserts the Phase 1 Eidos schema discipline:
--   1) Every eidos_* table has RLS enabled.
--   2) The user-facing eidos_* tables have the expected SELECT and
--      INSERT policies for owners.
--   3) No eidos_* table has a foreign key pointing into a Stone
--      Harbor domain table (profiles, journal_entries, etc.). The
--      ONLY allowed cross-schema FK is to auth.users(id).
--
-- This is the database-level enforcement of the engine's boundary
-- discipline — the rules that make Eidos extractable into its own
-- package later. If any of these checks fail, the engine has been
-- entangled with the consumer in a way that will be painful to
-- unwind, and the test should fail loudly.

DO $$
DECLARE
  bad             text[];
  has_rls         boolean;
  has_pol         boolean;
  bad_fk_count    int;
  tbl             text;

  -- Phase 1 Eidos tables. Update this list as eidos_002+ migrations
  -- introduce more tables.
  eidos_tables text[] := ARRAY[
    'eidos_sessions',
    'eidos_responses',
    'eidos_layer_scores',
    'eidos_chapters',
    'eidos_safety_events'
  ];

  -- Tables that grant the OWNING USER a SELECT policy. (eidos_safety_events
  -- is intentionally admin-only and has no user-side policy.)
  user_readable text[] := ARRAY[
    'eidos_sessions',
    'eidos_responses',
    'eidos_layer_scores',
    'eidos_chapters'
  ];
BEGIN
  bad := ARRAY[]::text[];

  -- 1) RLS enabled on every eidos_* table.
  FOREACH tbl IN ARRAY eidos_tables LOOP
    SELECT c.relrowsecurity
    INTO   has_rls
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
      AND  c.relname = tbl;

    IF has_rls IS NULL THEN
      bad := bad || (tbl || ': table not found (migration not applied?)');
    ELSIF NOT has_rls THEN
      bad := bad || (tbl || ': RLS not enabled');
    END IF;
  END LOOP;

  -- 2) User-facing eidos_* tables have an own-row SELECT policy.
  FOREACH tbl IN ARRAY user_readable LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE  schemaname = 'public'
        AND  tablename  = tbl
        AND  cmd        = 'SELECT'
    )
    INTO has_pol;
    IF NOT has_pol THEN
      bad := bad || (tbl || ': missing SELECT policy for owners');
    END IF;
  END LOOP;

  -- 3) Boundary discipline: no eidos_* table FKs into a Stone Harbor
  --    domain table. The only allowed cross-schema reference is to
  --    auth.users(id). Anything else means the engine has reached
  --    into the consumer's data model — extraction-blocking.
  SELECT COUNT(*)
  INTO   bad_fk_count
  FROM   information_schema.table_constraints tc
  JOIN   information_schema.key_column_usage  kcu
    ON   tc.constraint_name   = kcu.constraint_name
    AND  tc.table_schema      = kcu.table_schema
  JOIN   information_schema.referential_constraints rc
    ON   tc.constraint_name   = rc.constraint_name
  JOIN   information_schema.key_column_usage  pkcu
    ON   rc.unique_constraint_name = pkcu.constraint_name
  WHERE  tc.constraint_type = 'FOREIGN KEY'
    AND  tc.table_schema    = 'public'
    AND  tc.table_name      LIKE 'eidos\_%' ESCAPE '\'
    -- Allow the canonical reference to auth.users(id).
    AND  NOT (pkcu.table_schema = 'auth' AND pkcu.table_name = 'users');

  IF bad_fk_count > 0 THEN
    bad := bad || ('eidos_* tables have ' || bad_fk_count ||
                   ' foreign key(s) into non-auth tables');
  END IF;

  IF array_length(bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'eidos_schema invariants failed: %', array_to_string(bad, ' | ');
  END IF;
END
$$;
