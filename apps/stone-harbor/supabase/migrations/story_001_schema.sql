-- story_001_schema.sql
-- Stone Harbor Story Series infrastructure.
-- Cross-references: Eidos_Integration_Architecture_Memo_2026-05-28.md Part 3.5 + Part 4.5.
--
-- Two tables:
--   story_prompts             — multi-consumer, multi-language catalog of prompts
--   member_story_invitations  — per-member surfacing lifecycle + engagement telemetry
--
-- The story content itself lives in public.journal_entries. The invitation table
-- references the resulting journal entry via response_journal_entry_id so the
-- writing surface (and edit-window behavior) stays single-sourced.

-- =============================================================================
-- story_prompts
-- =============================================================================
create table public.story_prompts (
  id                   uuid primary key default gen_random_uuid(),
  consumer_slug        text not null default 'stone_harbor',
  language             text not null default 'en',
  series_slug          text not null,
  prompt_text          text not null,
  depth                int  not null check (depth between 1 and 4),
  themes               text[] not null default '{}',
  est_minutes          int,
  re_surface_eligible  boolean not null default true,
  order_hint           int,
  active               boolean not null default true,
  source_ref           text,
  regional_variants    jsonb  not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.story_prompts is
  'Catalog of Story Series prompts. Multi-consumer + multi-language. Architecture memo Part 3.5.';
comment on column public.story_prompts.depth is
  'Depth taxonomy: 1=Shore, 2=Wading, 3=Channel, 4=Open Water.';
comment on column public.story_prompts.regional_variants is
  'Optional per-region phrasing overrides keyed by locale (e.g. {"es_pr":"...","es_mx":"..."}).';

create index story_prompts_lookup_idx
  on public.story_prompts (consumer_slug, language, series_slug, depth, active);

create index story_prompts_themes_idx
  on public.story_prompts using gin (themes);

create trigger story_prompts_set_updated_at
  before update on public.story_prompts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- member_story_invitations
-- =============================================================================
create table public.member_story_invitations (
  id                          uuid primary key default gen_random_uuid(),
  member_id                   uuid not null references auth.users(id) on delete cascade,
  prompt_id                   uuid not null references public.story_prompts(id) on delete restrict,
  status                      text not null default 'pending'
                              check (status in ('pending','answered','skipped','snoozed','dismissed')),
  shown_at                    timestamptz not null default now(),
  responded_at                timestamptz,
  snooze_until                timestamptz,
  response_journal_entry_id   uuid references public.journal_entries(id) on delete set null,
  telemetry                   jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.member_story_invitations is
  'Per-member story prompt lifecycle. telemetry jsonb keys: time_to_first_keystroke_ms, total_writing_seconds, pauses_count, deletes_count, word_count.';

create index member_story_invitations_member_status_idx
  on public.member_story_invitations (member_id, status);

create index member_story_invitations_member_prompt_idx
  on public.member_story_invitations (member_id, prompt_id);

create index member_story_invitations_snooze_idx
  on public.member_story_invitations (member_id, snooze_until)
  where snooze_until is not null;

create trigger member_story_invitations_set_updated_at
  before update on public.member_story_invitations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.story_prompts             enable row level security;
alter table public.member_story_invitations  enable row level security;

-- Prompts: any authenticated member can read active prompts.
create policy story_prompts_read_active
  on public.story_prompts
  for select
  to authenticated
  using (active = true);

-- Invitations: members see + manage their own only.
create policy member_story_invitations_select_own
  on public.member_story_invitations
  for select
  to authenticated
  using (auth.uid() = member_id);

create policy member_story_invitations_insert_own
  on public.member_story_invitations
  for insert
  to authenticated
  with check (auth.uid() = member_id);

create policy member_story_invitations_update_own
  on public.member_story_invitations
  for update
  to authenticated
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id);

-- No delete policy: invitations are durable signal for Eidos.
