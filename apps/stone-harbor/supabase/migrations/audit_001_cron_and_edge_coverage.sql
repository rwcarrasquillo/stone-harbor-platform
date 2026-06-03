-- audit_001_cron_and_edge_coverage.sql
-- Applied 2026-05-30 via Supabase MCP to project fbqcmtcvgijlemfpncay.
-- Captured here for reproducibility + future-environment replay.
--
-- Closes the three audit-log coverage gaps surfaced in the 2026-05-30
-- admin tool audit:
--   1. Cron-fired content writes (blog_posts, daily_quotes,
--      external_content) silently bypass admin_audit_log because the
--      edge functions use the service role.
--   2. Edge function failures (rows in ai_usage_log with non-null error)
--      have no audit trail beyond ai_usage_log itself.
--
-- Approach: AFTER INSERT triggers on the three content tables write a
-- single audit row per insert, with admin_id=NULL to flag it as
-- system-originated. A separate trigger on ai_usage_log writes an
-- 'edge.failure' audit row whenever an AI call records an error.
--
-- Admin-triggered inserts (rare today — admins normally UPDATE drafts to
-- publish, not INSERT) are still captured by the existing route-level
-- logAudit helper, so duplicate rows are avoided as long as the route
-- runs FIRST (it does) and inserts via supabase.from(...).insert(...)
-- with the admin's bearer (which the audit-row INSERT path uses, not
-- the trigger).
--
-- More precisely: the trigger fires on every INSERT regardless of
-- caller. For now that's acceptable — duplicate audit rows for the
-- same logical event are tolerable (the trigger row carries
-- action='*.cron_generated', the route row carries the specific admin
-- action like 'blog.create'). We can tighten later by inspecting
-- current_setting('request.jwt.claim.role') inside the trigger.

-- ============================================================================
-- Helper: insert a system-originated audit row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_system_audit(
  p_action text,
  p_category text,
  p_target_type text,
  p_target_id text,
  p_target_label text,
  p_new_value jsonb,
  p_metadata jsonb DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.admin_audit_log (
    admin_id, admin_email, admin_display_name,
    action, category, target_type, target_id, target_label,
    prior_value, new_value, metadata
  ) VALUES (
    NULL, NULL, 'system',
    p_action, p_category, p_target_type, p_target_id, p_target_label,
    NULL, p_new_value, p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Trigger: blog_posts AFTER INSERT (AI-generated only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_blog_posts_audit_ai_insert()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_ai_generated = true THEN
    PERFORM public.log_system_audit(
      'blog.cron_generated',
      'system',
      'blog_post',
      NEW.id::text,
      NEW.title,
      jsonb_build_object(
        'pillar', NEW.pillar,
        'model', NEW.model,
        'is_published', NEW.is_published
      ),
      jsonb_build_object('source', 'edge:generate-blog-posts')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_blog_posts_ai_insert ON public.blog_posts;
CREATE TRIGGER audit_blog_posts_ai_insert
  AFTER INSERT ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_blog_posts_audit_ai_insert();

-- ============================================================================
-- Trigger: daily_quotes AFTER INSERT (AI-generated only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_daily_quotes_audit_ai_insert()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_ai_generated = true THEN
    PERFORM public.log_system_audit(
      'quote.cron_generated',
      'system',
      'daily_quote',
      NEW.id::text,
      LEFT(NEW.quote_text, 80),
      jsonb_build_object(
        'theme', NEW.theme,
        'category', NEW.category,
        'tone', NEW.tone,
        'model', NEW.model
      ),
      jsonb_build_object('source', 'edge:generate-daily-quote')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_daily_quotes_ai_insert ON public.daily_quotes;
CREATE TRIGGER audit_daily_quotes_ai_insert
  AFTER INSERT ON public.daily_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_daily_quotes_audit_ai_insert();

-- ============================================================================
-- Trigger: external_content AFTER INSERT (all — sourced by classifier)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_external_content_audit_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM public.log_system_audit(
    'external.cron_suggested',
    'system',
    'external_content',
    NEW.id::text,
    LEFT(NEW.title, 80),
    jsonb_build_object(
      'source_name', NEW.source_name,
      'pillar', NEW.pillar,
      'relevance_score', NEW.relevance_score,
      'classification_model', NEW.classification_model
    ),
    jsonb_build_object('source', 'edge:suggest-external-sources')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_external_content_insert ON public.external_content;
CREATE TRIGGER audit_external_content_insert
  AFTER INSERT ON public.external_content
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_external_content_audit_insert();

-- ============================================================================
-- Trigger: ai_usage_log AFTER INSERT (failure rows only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_ai_usage_log_audit_failure()
RETURNS trigger AS $$
BEGIN
  IF NEW.error IS NOT NULL AND COALESCE(NEW.called_from, '') LIKE 'edge:%' THEN
    PERFORM public.log_system_audit(
      'edge.failure',
      'system',
      'ai_usage_log',
      NEW.id::text,
      LEFT(NEW.error, 80),
      jsonb_build_object(
        'provider', NEW.provider,
        'model', NEW.model,
        'task', NEW.task,
        'called_from', NEW.called_from,
        'latency_ms', NEW.latency_ms
      ),
      jsonb_build_object('error_full', NEW.error)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_ai_usage_log_failure ON public.ai_usage_log;
CREATE TRIGGER audit_ai_usage_log_failure
  AFTER INSERT ON public.ai_usage_log
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ai_usage_log_audit_failure();

-- Backfill block from the original 2026-05-30 apply is intentionally
-- NOT included here — backfills are idempotent only when re-applied
-- against an empty DB. For a fresh environment, run the migration as-is
-- and the triggers handle all new inserts going forward.
