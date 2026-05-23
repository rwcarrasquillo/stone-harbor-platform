-- ───────────────────────────────────────────────────────────────────
-- DB test: critical RLS policies
--
-- Asserts that one member cannot read another member's private data
-- through the standard PostgREST/Supabase auth path. These tests
-- run as the "authenticated" role with set jwt.claims simulating
-- each user's session.
-- ───────────────────────────────────────────────────────────────────

begin;

set session_replication_role = 'replica';

-- Two synthetic users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'rls-test-c1@stoneharbor.test', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'rls-test-c2@stoneharbor.test', '', now(), now());

insert into public.profiles (id, email, display_name, healing_stage, privacy_level, role)
values
  ('00000000-0000-0000-0000-0000000000c1', 'rls-test-c1@stoneharbor.test', 'C1', 'Clarity', 'Members', 'member'),
  ('00000000-0000-0000-0000-0000000000c2', 'rls-test-c2@stoneharbor.test', 'C2', 'Clarity', 'Members', 'member');

-- Each member writes a private journal entry
insert into public.journal_entries (user_id, content, mood)
values
  ('00000000-0000-0000-0000-0000000000c1', 'C1 private content', 'grounded'),
  ('00000000-0000-0000-0000-0000000000c2', 'C2 private content', 'grounded');

-- Each member writes a body check
insert into public.body_checks (user_id, spots)
values
  ('00000000-0000-0000-0000-0000000000c1', array['chest']),
  ('00000000-0000-0000-0000-0000000000c2', array['gut']);

set session_replication_role = 'origin';

-- ── Test: C1 can read own entries, cannot read C2's ──────────────
do $$
declare
  v_own_count int;
  v_other_count int;
begin
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select count(*) into v_own_count
  from public.journal_entries
  where user_id = '00000000-0000-0000-0000-0000000000c1';

  select count(*) into v_other_count
  from public.journal_entries
  where user_id = '00000000-0000-0000-0000-0000000000c2';

  if v_own_count <> 1 then
    raise exception 'TEST FAIL: C1 should see own journal entry (count=%)', v_own_count;
  end if;
  if v_other_count <> 0 then
    raise exception 'TEST FAIL: C1 should NOT see C2 entries (leaked count=%)', v_other_count;
  end if;
end $$;

-- ── Test: C1 can read own body checks, cannot read C2's ──────────
do $$
declare
  v_own int;
  v_other int;
begin
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select count(*) into v_own
  from public.body_checks
  where user_id = '00000000-0000-0000-0000-0000000000c1';

  select count(*) into v_other
  from public.body_checks
  where user_id = '00000000-0000-0000-0000-0000000000c2';

  if v_own <> 1 then
    raise exception 'TEST FAIL: C1 should see own body check (count=%)', v_own;
  end if;
  if v_other <> 0 then
    raise exception 'TEST FAIL: C1 should NOT see C2 body checks (leaked count=%)', v_other;
  end if;
end $$;

reset role;
rollback;
