SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lyve-account-purge-daily';

SELECT cron.schedule(
  'lyve-account-purge-daily',
  '15 3 * * *',
  $$SELECT public.trigger_account_purge_http();$$
);