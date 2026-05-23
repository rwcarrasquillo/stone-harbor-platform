-- ───────────────────────────────────────────────────────────────────
-- DB test: match_brotherhood_pairing
--
-- Verifies the Postgres function correctly pairs two members from
-- the queue, snapshots their preferences, and marks both requests
-- matched in a single transaction. All test data is created and
-- rolled back inside the transaction.
-- ───────────────────────────────────────────────────────────────────

begin;

-- Disable triggers for the duration of this test so we can insert
-- synthetic auth.users rows without firing handle_new_user.
set session_replication_role = 'replica';

-- Two synthetic test users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000aa01', 'authenticated', 'authenticated', 'pair-test-a@stoneharbor.test', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000aa02', 'authenticated', 'authenticated', 'pair-test-b@stoneharbor.test', '', now(), now());

insert into public.profiles (id, email, display_name, healing_stage, privacy_level, role)
values
  ('00000000-0000-0000-0000-00000000aa01', 'pair-test-a@stoneharbor.test', 'Test A', 'Clarity', 'Members', 'member'),
  ('00000000-0000-0000-0000-00000000aa02', 'pair-test-b@stoneharbor.test', 'Test B', 'Clarity', 'Members', 'member');

-- Both members opt in. B opts in first so they're at the front of the queue.
insert into public.brotherhood_pairing_requests (user_id, preferred_time, topic_focus, status, created_at)
values
  ('00000000-0000-0000-0000-00000000aa02', 'Mornings',  'Fatherhood',     'open', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000aa01', 'Evenings',  'Career',         'open', now() - interval '1 hour');

-- The match function expects auth.uid() = p_user_id. Simulate that
-- by setting the request.jwt.claims so SECURITY DEFINER paths see
-- the right identity.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000aa01"}';

-- Run match for user A. Should pair with B (oldest open request).
do $$
declare
  v_pairing_id uuid;
  v_pair record;
  v_a_req record;
  v_b_req record;
begin
  select public.match_brotherhood_pairing('00000000-0000-0000-0000-00000000aa01') into v_pairing_id;
  if v_pairing_id is null then
    raise exception 'TEST FAIL: match returned null when a pairable other request existed';
  end if;

  select * into v_pair from public.brotherhood_pairings where id = v_pairing_id;
  if v_pair.status <> 'active' then
    raise exception 'TEST FAIL: pairing status should be active, got %', v_pair.status;
  end if;
  -- Canonical ordering: user_a_id < user_b_id
  if v_pair.user_a_id >= v_pair.user_b_id then
    raise exception 'TEST FAIL: pairing user_a_id (%) must be less than user_b_id (%)', v_pair.user_a_id, v_pair.user_b_id;
  end if;

  -- Preferences correctly snapshotted to the right slot regardless of canonical ordering
  if v_pair.user_a_id = '00000000-0000-0000-0000-00000000aa01' then
    if v_pair.user_a_preferred_time <> 'Evenings' then
      raise exception 'TEST FAIL: user_a preferred_time mismatch (got %)', v_pair.user_a_preferred_time;
    end if;
    if v_pair.user_b_preferred_time <> 'Mornings' then
      raise exception 'TEST FAIL: user_b preferred_time mismatch (got %)', v_pair.user_b_preferred_time;
    end if;
  else
    if v_pair.user_a_preferred_time <> 'Mornings' then
      raise exception 'TEST FAIL: user_a preferred_time mismatch (got %)', v_pair.user_a_preferred_time;
    end if;
  end if;

  -- Both requests marked matched
  select * into v_a_req from public.brotherhood_pairing_requests where user_id = '00000000-0000-0000-0000-00000000aa01';
  select * into v_b_req from public.brotherhood_pairing_requests where user_id = '00000000-0000-0000-0000-00000000aa02';
  if v_a_req.status <> 'matched' then
    raise exception 'TEST FAIL: user A request status should be matched, got %', v_a_req.status;
  end if;
  if v_b_req.status <> 'matched' then
    raise exception 'TEST FAIL: user B request status should be matched, got %', v_b_req.status;
  end if;
end $$;

-- Authorization: calling for someone else should fail
do $$
declare
  v_err text;
begin
  begin
    perform public.match_brotherhood_pairing('00000000-0000-0000-0000-00000000aa02');
    raise exception 'TEST FAIL: match should have rejected mismatched user_id';
  exception when others then
    v_err := SQLERRM;
    if v_err not like '%forbidden%' then
      raise exception 'TEST FAIL: expected forbidden error, got %', v_err;
    end if;
  end;
end $$;

rollback;
