CREATE TABLE IF NOT EXISTS public.mt5_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_account_id TEXT NOT NULL,
  login TEXT NOT NULL,
  server TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'MT5',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mt5_accounts TO authenticated;
GRANT ALL ON public.mt5_accounts TO service_role;

ALTER TABLE public.mt5_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own mt5 account" ON public.mt5_accounts;
CREATE POLICY "Users manage their own mt5 account" ON public.mt5_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mt5_accounts_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mt5_accounts_touch_updated_at() FROM anon;

DROP TRIGGER IF EXISTS update_mt5_accounts_updated_at ON public.mt5_accounts;
CREATE TRIGGER update_mt5_accounts_updated_at
  BEFORE UPDATE ON public.mt5_accounts
  FOR EACH ROW EXECUTE FUNCTION public.mt5_accounts_touch_updated_at();