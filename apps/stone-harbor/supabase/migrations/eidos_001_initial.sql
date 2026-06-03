-- Eidos — initial schema.
--
-- Foundational tables for the self-mapping engine. Designed to live
-- alongside Stone Harbor's domain schema without entanglement: every
-- table is prefixed `eidos_`, every foreign key references auth.users
-- only (never Stone Harbor's profiles or any product-specific table),
-- every table has row-level security restricting to the owning user.
--
-- This means a future second consumer can install this migration
-- against its own Supabase project and the schema works unchanged.
--
-- Six tables in Phase 1:
--   eidos_sessions       — one row per user × map journey
--   eidos_responses      — every item answer
--   eidos_layer_scores   — computed scores per user per layer
--   eidos_chapters       — generated Operating Manual chapters
--   eidos_safety_events  — crisis-routing events
--   (eidos_loops comes in Phase 2)

-- ============================================================
-- eidos_sessions
-- ============================================================
create table if not exists public.eidos_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  current_week    smallint not null default 0,   -- 0 = not yet begun, 1..3 = week
  current_module_id text,                         -- e.g. "1.1", "1.2", null between modules
  status          text not null default 'not_started'
                  check (status in ('not_started','in_progress','paused','complete')),
  started_at      timestamptz,
  last_active_at  timestamptz,
  updated_at      timestamptz not null default now(),
  unique (user_id)
);

create index if not exists eidos_sessions_user_id_idx on public.eidos_sessions(user_id);

-- ============================================================
-- eidos_responses
-- ============================================================
-- Raw responses to every item across every instrument. Value is jsonb
-- so each instrument can store whatever shape it needs (number for
-- Likert, boolean for ACE, array for multi-select).
create table if not exists public.eidos_responses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  instrument_id  text not null,    -- e.g. 'bfi10', 'schwartz', 'phq2gad2'
  item_id        text not null,    -- instrument-specific item key
  value          jsonb not null,
  responded_at   timestamptz not null default now(),
  unique (user_id, instrument_id, item_id)
);

create index if not exists eidos_responses_user_id_idx
  on public.eidos_responses(user_id);
create index if not exists eidos_responses_user_instrument_idx
  on public.eidos_responses(user_id, instrument_id);

-- ============================================================
-- eidos_layer_scores
-- ============================================================
-- Computed scores aggregated by layer (traits, values, motivational,
-- etc.). The `scores` jsonb is a flat key→number map; the consumer
-- knows the layer's shape from lib/eidos/types.ts.
create table if not exists public.eidos_layer_scores (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  layer        text not null
               check (layer in ('traits','developmental','cognitive','emotional',
                                'behavioral','decision','relational','motivational',
                                'values','clinical')),
  scores       jsonb not null,
  computed_at  timestamptz not null default now(),
  unique (user_id, layer)
);

create index if not exists eidos_layer_scores_user_id_idx
  on public.eidos_layer_scores(user_id);

-- ============================================================
-- eidos_chapters
-- ============================================================
-- Generated Operating Manual chapters. One row per (user, chapter,
-- language); a member can have an English Chapter 1 and a Spanish
-- Chapter 1 both stored. inputs is a jsonb snapshot of the data that
-- went into the prompt — useful for debugging "why did the chapter
-- come out this way" later.
create table if not exists public.eidos_chapters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  chapter_number  smallint not null check (chapter_number between 1 and 3),
  language        text not null default 'en' check (language in ('en','es')),
  body            text not null,
  inputs          jsonb not null default '{}'::jsonb,
  model           text,
  tokens_in       integer,
  tokens_out      integer,
  generated_at    timestamptz not null default now(),
  unique (user_id, chapter_number, language)
);

create index if not exists eidos_chapters_user_id_idx
  on public.eidos_chapters(user_id);

-- ============================================================
-- eidos_safety_events
-- ============================================================
-- Every time evaluateSafety() returns a non-'none' level, write a row.
-- The admin app's crisis-protocol surface reads from this table.
-- Append-only by convention (no update path through the engine API).
create table if not exists public.eidos_safety_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  level        text not null check (level in ('elevated','severe')),
  signals      jsonb not null default '[]'::jsonb,  -- e.g. ["phq2.severe"]
  context      jsonb,                                -- module id, week, etc.
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id),
  notes        text
);

create index if not exists eidos_safety_events_user_id_idx
  on public.eidos_safety_events(user_id);
create index if not exists eidos_safety_events_unresolved_idx
  on public.eidos_safety_events(created_at) where resolved_at is null;

-- ============================================================
-- Row-Level Security
-- ============================================================
-- Pattern: every user reads / writes only their own rows. Service-role
-- bypasses RLS entirely (used by the admin app and by edge functions
-- generating chapters). No cross-user access at the row level.

alter table public.eidos_sessions       enable row level security;
alter table public.eidos_responses      enable row level security;
alter table public.eidos_layer_scores   enable row level security;
alter table public.eidos_chapters       enable row level security;
alter table public.eidos_safety_events  enable row level security;

-- eidos_sessions
create policy "eidos_sessions own select"
  on public.eidos_sessions for select
  using ((select auth.uid()) = user_id);
create policy "eidos_sessions own insert"
  on public.eidos_sessions for insert
  with check ((select auth.uid()) = user_id);
create policy "eidos_sessions own update"
  on public.eidos_sessions for update
  using ((select auth.uid()) = user_id);

-- eidos_responses
create policy "eidos_responses own select"
  on public.eidos_responses for select
  using ((select auth.uid()) = user_id);
create policy "eidos_responses own insert"
  on public.eidos_responses for insert
  with check ((select auth.uid()) = user_id);
create policy "eidos_responses own update"
  on public.eidos_responses for update
  using ((select auth.uid()) = user_id);

-- eidos_layer_scores (read-only for users; writes via service-role)
create policy "eidos_layer_scores own select"
  on public.eidos_layer_scores for select
  using ((select auth.uid()) = user_id);

-- eidos_chapters (read-only for users; writes via service-role)
create policy "eidos_chapters own select"
  on public.eidos_chapters for select
  using ((select auth.uid()) = user_id);

-- eidos_safety_events (no user-side access — service-role + admin only)
-- Intentionally no policies for the anon / authenticated role — the
-- admin app reads via service-role, and members never query this
-- table directly. Surface safety-relevant information to members
-- through the consumer's UI, not through direct reads.

-- ============================================================
-- updated_at maintenance for eidos_sessions
-- ============================================================
create or replace function public.eidos_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists eidos_sessions_updated_at on public.eidos_sessions;
create trigger eidos_sessions_updated_at
  before update on public.eidos_sessions
  for each row execute function public.eidos_sessions_set_updated_at();

-- ============================================================
-- Done. Run eidos_002_*.sql next when Phase 2 schema is needed.
-- ============================================================
