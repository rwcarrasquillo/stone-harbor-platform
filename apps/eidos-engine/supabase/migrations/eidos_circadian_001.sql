-- Eidos — Circadian construct tables + settings seed (EID-20).
--
-- First construct in the five-perspective behavioral-inference layer.
-- Biological perspective. Per architecture spec §2 (Construct 1) + §3.
--
-- The pattern shipped here is the template every future construct
-- (cognitive, behavioural, psychodynamic, humanistic) will reuse:
--   one observations table (typed columns per sub-measure),
--   one baselines table (member-level trait + stddev for state deltas),
--   one settings row in eidos_construct_settings for cadences + thresholds.
--
-- Applied to project xfsqytpitltfeacvmvqm (eidos-engine) on 2026-06-10
-- as the first migration of the eidos-engine app. Companion to the
-- (currently un-source-controlled) eidos_behavioral_001 which added
-- the event_stream + consumers + ingest_log substrate.

-- ── eidos_circadian_observations ────────────────────────────────
-- One row per (member, consumer, computed_at). Written weekly by the
-- compute cron. All sub-measure columns are nullable so we can still
-- write a row when sample_size is below min — the row records the
-- gap rather than pretending the math is valid.

create table public.eidos_circadian_observations (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null,                  -- host-opaque user id
  consumer_id   text not null,                  -- 'stone_harbor', etc.

  window_start  timestamptz not null,
  window_end    timestamptz not null,

  sample_size   integer not null,               -- # events in window
  unique_days   integer not null,               -- # distinct local days

  -- Construct-specific typed columns. Nullable when below min sample.
  centroid_hour          numeric check (
    centroid_hour is null
    or (centroid_hour >= 0 and centroid_hour < 24)
  ),
  regularity_entropy     numeric check (
    regularity_entropy is null
    or (regularity_entropy >= 0 and regularity_entropy <= 1)
  ),
  night_load_fraction    numeric check (
    night_load_fraction is null
    or (night_load_fraction >= 0 and night_load_fraction <= 1)
  ),
  social_jet_lag_hours   numeric check (
    social_jet_lag_hours is null
    or (social_jet_lag_hours >= -12 and social_jet_lag_hours <= 12)
  ),

  confidence    numeric not null check (confidence >= 0 and confidence <= 1),

  -- Forensic pointer: which event_ids contributed, plus a 24-bin hour
  -- histogram. Lets the admin spot-check view (EID-21) reproduce the
  -- math without re-querying eidos_event_stream.
  evidence      jsonb not null default '{}'::jsonb,

  computed_at   timestamptz not null default now()
);

create index eidos_circadian_observations_member_idx
  on public.eidos_circadian_observations (consumer_id, member_id, computed_at desc);

alter table public.eidos_circadian_observations enable row level security;
-- No policies — service-role only, same pattern as eidos_event_stream.

-- ── eidos_circadian_baselines ───────────────────────────────────
-- One row per (member, consumer). Re-upserted monthly by the baseline
-- cron from the rolling history of observations. Acts as the reference
-- point for "state deltas" (this week vs. trait) on member surfaces.

create table public.eidos_circadian_baselines (
  member_id   uuid not null,
  consumer_id text not null,

  trait_centroid_hour              numeric,
  trait_centroid_hour_stddev       numeric,
  trait_regularity_entropy         numeric,
  trait_regularity_entropy_stddev  numeric,
  trait_night_load_fraction        numeric,
  trait_night_load_fraction_stddev numeric,
  trait_social_jet_lag_hours       numeric,

  sample_size integer not null,    -- # observations rolled into the baseline
  window_days integer not null,    -- baseline computation window
  computed_at timestamptz not null default now(),

  primary key (member_id, consumer_id)
);

alter table public.eidos_circadian_baselines enable row level security;
-- Same: service-role only.

-- ── Settings seed for 'circadian' on 'stone_harbor' ─────────────
-- Defaults per architecture spec §3 + EID-20 description.
-- The (construct, consumer_id) primary key on eidos_construct_settings
-- uses consumer_id='' for global defaults, but we seed the stone_harbor
-- row directly since it's the only consumer integrated today.

insert into public.eidos_construct_settings (
  construct, consumer_id,
  observation_window_days, observation_cadence_cron,
  baseline_window_days,    baseline_cadence_cron,
  min_sample_size, min_unique_days,
  full_confidence_sample_size, full_confidence_window_days,
  surfacing_confidence_threshold, enabled,
  notes
)
values (
  'circadian', 'stone_harbor',
  14, '0 6 * * 1',          -- 14-day rolling window; weekly cron Mondays 06:00 UTC
  60, '0 6 1 * *',          -- 60-day baseline window; monthly cron 1st 06:00 UTC
  5,  5,                    -- need ≥5 events across ≥5 unique days to compute
  20, 14,                   -- full confidence at 20 events / 14 days
  0.7, true,                -- surface to member only when confidence ≥ 0.7
  'Circadian construct (biological perspective). Sub-measures: '
  || 'chronotype centroid, regularity entropy, night-window load (23:00-04:00), '
  || 'social jet lag. Seeded 2026-06-10 with EID-20.'
)
on conflict (construct, consumer_id) do nothing;
