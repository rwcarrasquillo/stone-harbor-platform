-- sh_159_anon_reachable_db_holes.sql
--
-- SH-159: review findings 1, 3 and 7 from the 2026-10-04 security review. All
-- three were reachable without signing in.

-- 1. Brotherhood pairing RPCs ---------------------------------------------
-- `p_user_id <> auth.uid()` is NULL (not true) when auth.uid() is NULL, so a
-- signed-out caller sailed past the guard. Reject a NULL caller explicitly,
-- compare NULL-safely, require an active (non-suspended) member, and only
-- pair members of the same consumer.

create or replace function public.match_brotherhood_pairing(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_consumer text;
  v_my_request public.brotherhood_pairing_requests;
  v_other_request public.brotherhood_pairing_requests;
  v_lo uuid;
  v_hi uuid;
  v_pairing_id uuid;
begin
  -- Authorization: only a signed-in, active member can match themselves.
  if v_caller is null or p_user_id is distinct from v_caller then
    raise exception 'forbidden';
  end if;
  select consumer into v_consumer
    from public.profiles
   where id = v_caller and suspended_at is null;
  if not found then
    raise exception 'forbidden';
  end if;

  -- Fetch the caller's open request. If they don't have one, exit.
  select * into v_my_request
    from public.brotherhood_pairing_requests
   where user_id = p_user_id and status = 'open'
   for update;
  if not found then
    return null;
  end if;

  -- Find the oldest other open request from an active member of the same
  -- consumer.
  select r.* into v_other_request
    from public.brotherhood_pairing_requests r
    join public.profiles p on p.id = r.user_id
   where r.status = 'open'
     and r.user_id <> p_user_id
     and p.suspended_at is null
     and p.consumer = v_consumer
   order by r.created_at asc
   limit 1
   for update of r;
  if not found then
    return null;
  end if;

  -- Determine canonical user order for the pairing row.
  v_lo := least(p_user_id, v_other_request.user_id);
  v_hi := greatest(p_user_id, v_other_request.user_id);

  -- Create the pairing.
  insert into public.brotherhood_pairings (
    user_a_id, user_b_id,
    user_a_preferred_time, user_a_topic_focus,
    user_b_preferred_time, user_b_topic_focus
  ) values (
    v_lo, v_hi,
    case when v_lo = p_user_id then v_my_request.preferred_time else v_other_request.preferred_time end,
    case when v_lo = p_user_id then v_my_request.topic_focus else v_other_request.topic_focus end,
    case when v_hi = p_user_id then v_my_request.preferred_time else v_other_request.preferred_time end,
    case when v_hi = p_user_id then v_my_request.topic_focus else v_other_request.topic_focus end
  )
  returning id into v_pairing_id;

  -- Mark both requests as matched.
  update public.brotherhood_pairing_requests
     set status = 'matched', matched_at = now()
   where id in (v_my_request.id, v_other_request.id);

  return v_pairing_id;
end;
$function$;

create or replace function public.end_brotherhood_pairing(p_pairing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_pairing public.brotherhood_pairings;
begin
  if v_caller is null then
    raise exception 'forbidden';
  end if;

  select * into v_pairing
    from public.brotherhood_pairings
   where id = p_pairing_id and status = 'active'
   for update;
  if not found then
    raise exception 'pairing not found or already ended';
  end if;

  if v_caller is distinct from v_pairing.user_a_id
     and v_caller is distinct from v_pairing.user_b_id then
    raise exception 'forbidden';
  end if;

  update public.brotherhood_pairings
     set status = 'ended', ended_at = now(), ended_by = v_caller
   where id = p_pairing_id;
end;
$function$;

revoke all on function public.match_brotherhood_pairing(uuid) from public, anon;
revoke all on function public.end_brotherhood_pairing(uuid) from public, anon;
grant execute on function public.match_brotherhood_pairing(uuid) to authenticated;
grant execute on function public.end_brotherhood_pairing(uuid) to authenticated;

-- 3. log_system_audit -------------------------------------------------------
-- Internal-only: its only callers are SECURITY DEFINER triggers, which run as
-- the owner and keep access. Nobody outside the database may forge "system"
-- audit rows.

alter function public.log_system_audit(text, text, text, text, text, jsonb, jsonb)
  set search_path = public;
revoke all on function public.log_system_audit(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_system_audit(text, text, text, text, text, jsonb, jsonb)
  to service_role;

-- 7. Analytics views ----------------------------------------------------------
-- The 12 operational views move to `internal`, a schema the Data API doesn't
-- expose. A gated wrapper keeps each public name, so the admin app (admin
-- JWT) and server routes (service role) keep working, but return no rows to
-- anyone else.

create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;

do $$
declare
  v text;
begin
  foreach v in array array[
    'v_admin_daily_rollup', 'v_ai_usage_mtd', 'v_brotherhood_pair_health',
    'v_member_acquisition_summary', 'v_member_activity_daily',
    'v_member_activity_weekly', 'v_member_cohort_retention',
    'v_member_cohort_sizes', 'v_member_geo_country', 'v_member_geo_region',
    'v_member_milestone_counts', 'v_member_visit_heatmap'
  ] loop
    execute format('alter view public.%I set schema internal', v);
    execute format(
      'create view public.%I as select * from internal.%I '
      || 'where public.is_admin((select auth.uid())) '
      || 'or (select auth.role()) = ''service_role''', v, v);
    execute format('revoke all on public.%I from public, anon', v);
    execute format('grant select on public.%I to authenticated, service_role', v);
  end loop;
end
$$;

-- visible_patrons feeds the public supporters wall, so it stays readable by
-- anon. It no longer exposes member ids, just the opt-in first name.
drop view if exists public.visible_patrons;
create view public.visible_patrons as
  select
    coalesce(
      p.patron_wall_name,
      nullif(split_part(p.display_name, ' ', 1), ''),
      nullif(split_part(p.full_name, ' ', 1), '')
    ) as first_name,
    p.patron_since
  from public.profiles p
  where p.patron_status = 'active'
    and p.patron_wall_visible = true
    and coalesce(
      p.patron_wall_name,
      nullif(split_part(p.display_name, ' ', 1), ''),
      nullif(split_part(p.full_name, ' ', 1), '')
    ) is not null;
revoke all on public.visible_patrons from public;
grant select on public.visible_patrons to anon, authenticated, service_role;
