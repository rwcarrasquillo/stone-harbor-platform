-- sh_154_cron_jobs_new_secret_key.sql
--
-- SH-154: switch the three edge-function pg_cron jobs off the legacy
-- service-role JWT, so SH-149 phase 8 can deactivate the legacy keys.
--
-- Before: Authorization: Bearer <vault 'cron_service_role_key'>  (legacy JWT)
-- After:  apikey: <vault 'cron_secret_key'>                      (sb_secret_ key)
--
-- The functions (deployed with verify_jwt = false) accept the secret key
-- in `apikey` via functions/_shared/auth.ts.
--
-- PREREQUISITE (done by hand, never in a file): the new secret key must
-- already be stored in Vault as `cron_secret_key`:
--   select vault.create_secret('<sb_secret_ value>', 'cron_secret_key',
--     'SH-154: secret key used by pg_cron to call edge functions');
-- This migration refuses to run if it's missing, so the jobs can never
-- be left pointing at a secret that doesn't exist.
--
-- The legacy `cron_service_role_key` vault secret is left in place here.
-- It's deleted after the jobs are verified on the new key (SH-149 phase 8).

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret_key') then
    raise exception 'vault secret cron_secret_key is missing: create it first (see header)';
  end if;
end
$$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'generate-daily-quote'),
  command := $cmd$
    select net.http_post(
      url := 'https://fbqcmtcvgijlemfpncay.supabase.co/functions/v1/generate-daily-quote',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret_key'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'generate-blog-posts-daily'),
  command := $cmd$
    select net.http_post(
      url := 'https://fbqcmtcvgijlemfpncay.supabase.co/functions/v1/generate-blog-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret_key'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'ingest-external-content-daily'),
  command := $cmd$
    select net.http_post(
      url := 'https://fbqcmtcvgijlemfpncay.supabase.co/functions/v1/ingest-external-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret_key'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);
