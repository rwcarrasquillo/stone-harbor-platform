-- sh_153a_member_lookup_rpcs_and_hardening.sql
--
-- SH-153, step A: ADDITIVE ONLY. Safe to apply before the app code ships,
-- because nothing here removes access the current app relies on.
--
--   1. Narrow SECURITY DEFINER lookups for the few places a member
--      legitimately needs another member's info. They return public card
--      fields only (no email/phone/birthday/etc.) and are scoped to the
--      caller's consumer.
--   2. Admin read policy on profiles, so the admin app keeps working once
--      step B makes profiles own-row-only for everyone else.
--   3. (updated_at is already set by an existing trigger, so nothing changes.)
--   4. Defense in depth: anon has no business on profiles; members can't
--      insert therapist_accounts (only the service role does) and can't
--      delete/truncate profiles.

-- 1. Member lookups -------------------------------------------------------

create or replace function public.get_member_cards(p_ids uuid[])
returns table (id uuid, display_name text, username text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url
    from public.profiles p
   where (select auth.uid()) is not null
     and p.id = any(p_ids[1:200])
     and p.consumer = public.current_user_consumer();
$$;

create or replace function public.search_members(p_query text)
returns table (id uuid, display_name text, username text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url
    from public.profiles p
   where (select auth.uid()) is not null
     and length(trim(p_query)) >= 2
     and p.id <> (select auth.uid())
     and p.consumer = public.current_user_consumer()
     and p.suspended_at is null
     and (
       p.display_name ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%'
       or p.username ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%'
     )
   order by p.display_name nulls last
   limit 10;
$$;

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and not exists (
       select 1
         from public.profiles p
        where lower(p.username) = lower(trim(p_username))
          and p.id <> (select auth.uid())
     );
$$;

revoke all on function public.get_member_cards(uuid[]) from public, anon;
revoke all on function public.search_members(text) from public, anon;
revoke all on function public.is_username_available(text) from public, anon;
grant execute on function public.get_member_cards(uuid[]) to authenticated;
grant execute on function public.search_members(text) to authenticated;
grant execute on function public.is_username_available(text) to authenticated;

-- 2. Admins can read profiles (admin app reads with the admin's own JWT) --

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read"
  on public.profiles for select
  to authenticated
  using (public.is_admin((select auth.uid())));

-- 3. updated_at is already server-owned: the existing set_profiles_updated_at
--    trigger (set_updated_at()) overwrites it on every UPDATE. Nothing to add.

-- 4. Defense in depth -------------------------------------------------------

revoke all on public.profiles from anon;

revoke insert on public.therapist_accounts from anon, authenticated;

-- Members never delete or truncate profiles (account closure goes through
-- the member_self_close_account definer RPC). TRUNCATE in particular skips
-- RLS entirely. Column-level INSERT revokes would be a no-op while the
-- table-level INSERT grant exists (see SH-148), so INSERT is removed
-- outright in step B, once the app no longer upserts.
revoke delete, truncate, references, trigger on public.profiles from authenticated;
