-- lovable-cron-fallback-reviewed: 1440 runs/day; live trading bot must react to price within one minute or it misses its averaging step and profit target.
CREATE TABLE public.bot_cron_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_cron_secret TO service_role;
ALTER TABLE public.bot_cron_secret ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service_role (background jobs) may read it.

INSERT INTO public.bot_cron_secret (id, token)
VALUES (true, encode(gen_random_bytes(32), 'hex'));

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'lyve-bot-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--536d07ee-80ea-495b-b1b9-125302666ed1.lovable.app/api/public/cron/bot-tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (SELECT token FROM public.bot_cron_secret LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);