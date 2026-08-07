/*
  # Setup pg_cron jobs for pull list sync

  ## Summary
  Schedules two weekly cron jobs that invoke the sync-pull-list edge function:
  - Primary: Monday 6AM UTC (first attempt)
  - Retry: Monday 11AM UTC (catches any primary failures)

  ## Prerequisites
  Before deploying this migration, add the sync secret to app_settings via the
  Supabase dashboard SQL editor (NOT in this file — keep the secret out of git):

    INSERT INTO app_settings (key, value)
    VALUES ('pull_list_sync_secret', '<value-of-PULL_LIST_SYNC_SECRET>')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  ## Dependencies
  - pg_cron extension (enabled by default in Supabase)
  - pg_net extension (enabled by default in Supabase)
  - app_settings table with pull_list_sync_secret key
  - sync-pull-list edge function deployed to this project
*/

-- Enable pg_cron extension (requires superuser; on Supabase this is the postgres role)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Reads pull_list_sync_secret from app_settings (bypasses RLS since pg_cron runs
-- as postgres superuser) and POSTs to the sync-pull-list edge function.
CREATE OR REPLACE FUNCTION public.trigger_pull_list_sync(trigger_type text DEFAULT 'primary')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_project_url text := 'https://fsqmyefqbjndilrwluep.supabase.co';
BEGIN
  SELECT value INTO v_secret FROM app_settings WHERE key = 'pull_list_sync_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_pull_list_sync: pull_list_sync_secret not set in app_settings, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_project_url || '/functions/v1/sync-pull-list',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object('trigger', trigger_type)
  );
END;
$$;

-- Remove existing schedules if re-running (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-pull-list-primary') THEN
    PERFORM cron.unschedule('sync-pull-list-primary');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-pull-list-retry') THEN
    PERFORM cron.unschedule('sync-pull-list-retry');
  END IF;
END;
$$;

-- Primary trigger: Monday 6AM UTC
SELECT cron.schedule(
  'sync-pull-list-primary',
  '0 6 * * 1',
  $cmd$ SELECT public.trigger_pull_list_sync('primary'); $cmd$
);

-- Retry trigger: Monday 11AM UTC (catches primary failures)
SELECT cron.schedule(
  'sync-pull-list-retry',
  '0 11 * * 1',
  $cmd$ SELECT public.trigger_pull_list_sync('retry'); $cmd$
);
