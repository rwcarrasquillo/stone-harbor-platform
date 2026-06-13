-- EID-37 — Drop prototype residue from eidos-engine Supabase project.
--
-- Two categories of tables are removed:
--
-- (1) Prototype assessment tables created during the pre-architecture-lock
-- exploratory phase. RLS was never enabled on them (flagged as critical by
-- the Supabase advisor). Zero rows, zero references in the canonical
-- eidos-engine app or eidos-admin app codebases.
--
--   - eidos_assessment_sessions
--   - eidos_assessment_answers
--   - eidos_snapshots
--
-- (2) Phantom copies of tables whose canonical home is the Stone Harbor
-- Supabase project (fbqcmtcvgijlemfpncay). These were created in the early
-- eidos-engine provisioning thinking they would migrate, but the
-- architecture lock (2026-06-07) kept the instrument flow + knowledge
-- corpus in Stone Harbor DB for now. The eidos-engine copies are stale
-- empty duplicates. The canonical copies in Stone Harbor DB hold the live
-- data (36 eidos_responses rows, 19 knowledge_chunks rows, etc.) and are
-- untouched by this migration.
--
--   - eidos_chapters
--   - eidos_layer_scores
--   - eidos_responses
--   - eidos_safety_events
--   - eidos_sessions
--   - knowledge_chunks
--   - knowledge_sources
--
-- After this migration, the eidos-engine Supabase project contains ONLY
-- the behavioral-inference layer:
--
--   - eidos_event_stream
--   - eidos_consumers
--   - eidos_consumer_tokens
--   - eidos_construct_settings
--   - eidos_construct_feedback
--   - eidos_ingest_log
--   - eidos_circadian_observations
--   - eidos_circadian_baselines
--
-- which matches the architectural intent: eidos-engine is the
-- behavioral-inference service substrate, nothing more.

BEGIN;

-- (1) Prototype residue.
DROP TABLE IF EXISTS public.eidos_assessment_answers CASCADE;
DROP TABLE IF EXISTS public.eidos_assessment_sessions CASCADE;
DROP TABLE IF EXISTS public.eidos_snapshots CASCADE;

-- (2) Phantom copies of Stone Harbor instrument flow + knowledge corpus.
-- Drop dependents first to keep CASCADE behavior explicit.
DROP TABLE IF EXISTS public.eidos_chapters CASCADE;
DROP TABLE IF EXISTS public.eidos_layer_scores CASCADE;
DROP TABLE IF EXISTS public.eidos_safety_events CASCADE;
DROP TABLE IF EXISTS public.eidos_responses CASCADE;
DROP TABLE IF EXISTS public.eidos_sessions CASCADE;
DROP TABLE IF EXISTS public.knowledge_chunks CASCADE;
DROP TABLE IF EXISTS public.knowledge_sources CASCADE;

COMMIT;
