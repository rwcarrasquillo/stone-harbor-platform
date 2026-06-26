-- psychologist_001_schema.sql
-- ============================================================================
-- SH-87 — Psychologist agent: proposal storage + config.
--
-- DRAFT — NOT YET APPLIED. This file is committed for review alongside
-- Stone_Harbor_Psychologist_Agent.md. Apply it (via Supabase MCP apply_migration
-- or the SQL editor) only after the founder's clinical pass on the prompt and a
-- go-ahead to build. Nothing here touches existing tables' data.
--
-- Creates:
--   1. psychologist_runs       — one row per agent run (cron or manual).
--   2. psychologist_proposals  — the agent's pending proposals, reviewed +
--      approved/applied by the founder in the admin. NEVER auto-applied.
--   3. admin_settings columns  — allowlist + cadence flags the agent reads.
--
-- RLS mirrors blog_failed_drafts (admin-only via admin_accounts). The edge
-- function writes with the service role, which bypasses RLS.
-- ============================================================================

-- ─── 1. Runs ────────────────────────────────────────────────────────────────
create table if not exists public.psychologist_runs (
  id             uuid primary key default gen_random_uuid(),
  triggered_by   text not null check (triggered_by in ('cron', 'manual')),
  status         text not null default 'running'
                   check (status in ('running', 'completed', 'failed')),
  summary        text,
  proposal_count int  not null default 0,
  provider       text,
  model          text,
  input_tokens   int,
  output_tokens  int,
  estimated_cost_usd numeric(10, 6),
  error          text,
  ran_at         timestamptz not null default now()
);

-- ─── 2. Proposals ────────────────────────────────────────────────────────────
-- target_angle_id is intentionally NOT a foreign key: new_angle proposals
-- reference an angle that does not exist yet, and pillar_recommendation targets
-- no angle at all. Validate the reference at apply time, not here.
create table if not exists public.psychologist_proposals (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.psychologist_runs(id) on delete cascade,
  impact_rank    int  not null,
  proposal_type  text not null check (proposal_type in (
                   'embodiment_refinement', 'substrate_refinement',
                   'new_angle', 'retirement', 'pillar_recommendation')),
  target_angle_id text,                 -- null for new_angle / pillar_recommendation
  target_pillar   text,                 -- for new_angle / pillar_recommendation
  language        text check (language in ('en', 'es', 'both')),
  current_value   jsonb,
  proposed_value  jsonb,
  reasoning       text not null,
  citations       jsonb not null default '[]'::jsonb,
  -- set by the edge function's post-generation allowlist check; the model's
  -- self-reported citations are NOT trusted on their own.
  citations_validated boolean not null default false,
  confidence      text check (confidence in ('well_validated', 'emerging', 'contested')),
  status          text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  applied_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists psychologist_proposals_run_id_idx
  on public.psychologist_proposals (run_id);
create index if not exists psychologist_proposals_status_idx
  on public.psychologist_proposals (status);
create index if not exists psychologist_proposals_angle_idx
  on public.psychologist_proposals (target_angle_id);

-- ─── 3. admin_settings columns ───────────────────────────────────────────────
alter table public.admin_settings
  add column if not exists psychologist_source_allowlist  jsonb       not null default '[]'::jsonb,
  add column if not exists psychologist_quarterly_enabled boolean     not null default false,
  add column if not exists psychologist_last_run_at        timestamptz;

-- Seed the starting allowlist (peer-reviewed psychology sources only).
update public.admin_settings
set psychologist_source_allowlist = '[
  "pubmed.ncbi.nlm.nih.gov",
  "scholar.google.com",
  "journals.apa.org",
  "onlinelibrary.wiley.com",
  "link.springer.com",
  "www.tandfonline.com",
  "journals.sagepub.com"
]'::jsonb
where id = 1
  and (psychologist_source_allowlist is null
       or psychologist_source_allowlist = '[]'::jsonb);

-- ─── RLS (admin-only; mirrors blog_failed_drafts) ────────────────────────────
alter table public.psychologist_runs      enable row level security;
alter table public.psychologist_proposals enable row level security;

create policy "psychologist_runs: admins read" on public.psychologist_runs
  for select using (exists (select 1 from public.admin_accounts a where a.user_id = auth.uid()));
create policy "psychologist_runs: admins write" on public.psychologist_runs
  for all using (exists (select 1 from public.admin_accounts a where a.user_id = auth.uid()));

create policy "psychologist_proposals: admins read" on public.psychologist_proposals
  for select using (exists (select 1 from public.admin_accounts a where a.user_id = auth.uid()));
create policy "psychologist_proposals: admins write" on public.psychologist_proposals
  for all using (exists (select 1 from public.admin_accounts a where a.user_id = auth.uid()));
