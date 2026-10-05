-- SH-161 — Oct-4 security review, batch 3 (database half).
--
--   finding 8   suspension enforced in RLS, not just client redirects
--   finding 13  journal originals / created_at immutable; 6-hour edit
--               window enforced in the database
--   storage     profile-images + admin-media get size + MIME limits
--   finding 9   rate-limit ledger used by AI / registration / checkout
--               API routes

-- ─────────────────────────────────────────────────────────────────
-- 1. Suspension (finding 8)
-- ─────────────────────────────────────────────────────────────────
-- True unless the caller's profile is suspended. Written as "not
-- suspended" (rather than "has an active profile") so callers without
-- a profile row (staff JWTs, service paths) are unaffected.
create or replace function public.is_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from public.profiles
     where id = (select auth.uid())
       and suspended_at is not null
  );
$$;

revoke all on function public.is_not_suspended() from public, anon;
grant execute on function public.is_not_suspended() to authenticated, service_role;

-- RESTRICTIVE write policies on member-authored tables. Reads stay
-- open so /suspended can still show warnings; profiles is excluded so
-- a suspended member can still submit an appeal; service_role bypasses
-- RLS so admin tooling is unaffected.
do $$
declare
  t text;
  member_tables text[] := array[
    'journal_entries',
    'member_posts',
    'post_solidarity',
    'blog_comments',
    'messages',
    'conversations',
    'conversation_members',
    'brotherhood_pairing_requests',
    'brotherhood_pairings',
    'content_flags',
    'body_checks',
    'small_things',
    'user_small_things',
    'member_story_invitations',
    'profile_cover_images',
    'eidos_responses',
    'eidos_sessions',
    'user_roadmap_progress'
  ];
begin
  foreach t in array member_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'sh_161: skipping missing table %', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.is_not_suspended()))',
      t || '_not_suspended_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using ((select public.is_not_suspended())) with check ((select public.is_not_suspended()))',
      t || '_not_suspended_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using ((select public.is_not_suspended()))',
      t || '_not_suspended_delete', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Journal integrity (finding 13)
-- ─────────────────────────────────────────────────────────────────
-- Member writes (authenticated JWT) are normalised:
--   INSERT  created_at = now(); originals = first-save title/content;
--           edited_at cleared.
--   UPDATE  originals, created_at, user_id, consumer pinned to OLD;
--           title/content edits only within 6 hours of created_at
--           (plus 2 minutes of clock grace); edited_at stamped by the
--           server. Service-role writes pass through untouched.
create or replace function public.journal_entries_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.role()), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at       := now();
    new.original_content := new.content;
    new.original_title   := new.title;
    new.edited_at        := null;
    return new;
  end if;

  new.original_content := old.original_content;
  new.original_title   := old.original_title;
  new.created_at       := old.created_at;
  new.user_id          := old.user_id;
  new.consumer         := old.consumer;

  if new.content is distinct from old.content
     or new.title is distinct from old.title then
    if now() > old.created_at + interval '6 hours 2 minutes' then
      raise exception 'journal_edit_window_closed'
        using errcode = 'check_violation',
              hint = 'Entries can be edited for 6 hours after they are written.';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

drop trigger if exists journal_entries_guard on public.journal_entries;
create trigger journal_entries_guard
  before insert or update on public.journal_entries
  for each row execute function public.journal_entries_guard();

-- ─────────────────────────────────────────────────────────────────
-- 3. Storage limits
-- ─────────────────────────────────────────────────────────────────
-- profile-images matches the banners bucket (largest existing object
-- is ~6.4 MB PNG). admin-media matches the admin console's own
-- SIZE_LIMITS (50 MB) and the kinds it catalogues; SVG is deliberately
-- excluded from both public buckets (script-capable).
update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'profile-images';

update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/png','image/jpeg','image/webp','image/gif','image/avif',
         'audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/webm',
         'video/mp4','application/pdf'
       ]
 where id = 'admin-media';

-- ─────────────────────────────────────────────────────────────────
-- 4. Rate-limit ledger (finding 9)
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.api_rate_limits (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, subject, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant all on public.api_rate_limits to service_role;

-- Fixed-window counter. Returns true when the call is allowed (this
-- hit is within the limit), false when it should be rejected.
create or replace function public.hit_rate_limit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.api_rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start)
  do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup; keeps the table tiny without a cron job.
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
