-- sh_153b_profiles_own_row_select_and_identity_lock.sql
--
-- SH-153, step B: RESTRICTIVE. Apply only AFTER the SH-153 app code is
-- live in production (profile save uses .update() without id/email, theme
-- save uses .update(), Messages/Brotherhood/username checks use the RPCs
-- from step A). Applying this earlier breaks those flows.
--
--   Gap 2: members can read only their own profile row (admins via the
--          profiles_admin_read policy from step A). Cross-member needs go
--          through get_member_cards / search_members / is_username_available.
--   Gap 1: re-revoke UPDATE on email and id (the interim sh_148d grant).
--   Also: members no longer INSERT profiles at all (rows come from the
--   handle_new_user definer trigger; /api/register uses the service role).
--   The table-level INSERT grant covered role/patron/moderation columns.

drop policy if exists "Authenticated users can view profiles" on public.profiles;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke update (email, id) on public.profiles from authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
revoke insert on public.profiles from authenticated;
