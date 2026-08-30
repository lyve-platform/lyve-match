CREATE TABLE public.bot_configs (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  symbol TEXT NOT NULL DEFAULT 'XAUUSD',
  direction TEXT NOT NULL DEFAULT 'buy',
  base_lot NUMERIC NOT NULL DEFAULT 0.01,
  multiplier NUMERIC NOT NULL DEFAULT 2,
  step_points NUMERIC NOT NULL DEFAULT 300,
  max_legs INTEGER NOT NULL DEFAULT 6,
  target_usd NUMERIC NOT NULL DEFAULT 5,
  max_loss_usd NUMERIC NOT NULL DEFAULT 200,
  daily_loss_usd NUMERIC NOT NULL DEFAULT 300,
  min_margin_pct NUMERIC NOT NULL DEFAULT 200,
  max_total_lots NUMERIC NOT NULL DEFAULT 1,
  disabled_reason TEXT,
  last_tick_at TIMESTAMPTZ,
  day_key DATE,
  day_realized_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_configs TO authenticated;
GRANT ALL ON public.bot_configs TO service_role;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot config" ON public.bot_configs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.bot_baskets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  legs_filled INTEGER NOT NULL DEFAULT 0,
  last_entry_price NUMERIC,
  avg_price NUMERIC,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  realized_usd NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX bot_baskets_open_idx ON public.bot_baskets (user_id) WHERE closed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_baskets TO authenticated;
GRANT ALL ON public.bot_baskets TO service_role;
ALTER TABLE public.bot_baskets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot baskets" ON public.bot_baskets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.bot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bot_runs_user_time_idx ON public.bot_runs (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.bot_runs TO authenticated;
GRANT ALL ON public.bot_runs TO service_role;
ALTER TABLE public.bot_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot runs" ON public.bot_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);