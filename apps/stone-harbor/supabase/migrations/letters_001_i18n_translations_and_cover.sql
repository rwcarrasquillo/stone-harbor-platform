-- letters_001_i18n_translations_and_cover.sql
-- Letters i18n Phase 1A — translations child table + cover image column +
-- bilingual prompt templates. Applied to prod 2026-06-21 via Cowork.
--
-- This file exists so the repo migration history stays in sync with prod.
-- Re-applying against an empty DB rebuilds the same shape that prod has now.
-- Re-applying against prod is a no-op because every statement is idempotent.

-- 1. Translations child table
create table if not exists public.blog_post_translations (
  post_id        uuid not null references public.blog_posts(id) on delete cascade,
  language       text not null check (language in ('en', 'es')),
  title          text not null,
  excerpt        text,
  summary        text,
  content        text not null,
  slug           text,
  is_published   boolean not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (post_id, language)
);

create unique index if not exists idx_blog_post_translations_lang_slug
  on public.blog_post_translations(language, slug)
  where slug is not null;

create index if not exists idx_blog_post_translations_language_published
  on public.blog_post_translations(language, is_published, published_at desc);

comment on table public.blog_post_translations is
  'Language-specific fields for blog_posts. Industry-standard i18n child table.';

-- 2. Cover image on the parent
alter table public.blog_posts add column if not exists cover_image_url text;
comment on column public.blog_posts.cover_image_url is
  'Letter-level atmospheric cover panel. Null falls back to gradient + sigil slot.';

-- 3. RLS — mirrors blog_posts contract
alter table public.blog_post_translations enable row level security;

create policy "Read published translations; admins read all"
  on public.blog_post_translations for select
  using (
    is_published = true
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

create policy "Admins can insert translations"
  on public.blog_post_translations for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

create policy "Admins can update translations"
  on public.blog_post_translations for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

create policy "Admins can delete translations"
  on public.blog_post_translations for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

-- 4. Backfill English translations from existing blog_posts
insert into public.blog_post_translations
  (post_id, language, title, excerpt, summary, content, is_published, published_at, created_at, updated_at)
select
  id, 'en', title, excerpt, summary, content, is_published, published_at, created_at, updated_at
from public.blog_posts
where consumer = 'stone_harbor'
on conflict (post_id, language) do nothing;

-- 5. Bilingual prompt templates
--    .en mirrors of the legacy templates + native Spanish .es templates.
--    Legacy blog.{pillar} rows are left in place until Phase 1C.
--    Full SQL is in the prod Supabase migration history under
--    letters_i18n_phase_1a_bilingual_prompt_templates. See
--    Cowork session 2026-06-21 for the exact INSERT bodies.
