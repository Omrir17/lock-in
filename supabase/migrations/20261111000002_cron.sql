-- Every 10 minutes, ask the notify function whether a question is due.
-- notify is idempotent (notify_log), so extra calls never send twice.
-- __PROJECT_REF__ is filled in by the deploy workflow.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'lock-in-notify',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://__PROJECT_REF__.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "tick"}'::jsonb
  );
  $$
);
