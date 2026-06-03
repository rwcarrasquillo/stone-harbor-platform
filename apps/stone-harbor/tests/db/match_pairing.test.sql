-- Stone Harbor — DB test: match_pairing
--
-- Asserts that the match_brotherhood_pairing(p_user_id) RPC
-- exists and is callable. We don't actually run the matching
-- logic against real members (we'd need to manufacture two
-- consenting open requests inside a savepoint, which is doable
-- but noisy) — we verify the function signature and that calling
-- it with a non-existent user is a clean no-op rather than an
-- error.
--
-- This test guards against accidental drops or signature
-- changes that would silently break /messages on the member app.

DO $$
DECLARE
  has_fn   boolean;
  ok       boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'match_brotherhood_pairing'
  )
  INTO   has_fn;

  IF NOT has_fn THEN
    RAISE EXCEPTION
      'fail: public.match_brotherhood_pairing(...) does not exist';
  END IF;

  -- Call with a UUID guaranteed not to map to any open request.
  -- The function should return without error (no match available).
  BEGIN
    PERFORM public.match_brotherhood_pairing(
      '00000000-0000-0000-0000-000000000000'::uuid
    );
    ok := true;
  EXCEPTION WHEN OTHERS THEN
    ok := false;
  END;

  IF NOT ok THEN
    RAISE EXCEPTION
      'fail: match_brotherhood_pairing raised on a no-op call';
  END IF;
END $$;
