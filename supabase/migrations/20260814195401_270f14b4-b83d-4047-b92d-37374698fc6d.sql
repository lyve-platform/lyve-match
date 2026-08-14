-- ============================================================
-- LYVE Phase 5 — billing, subscriptions, entitlements
-- No payment provider is connected. This is architecture only.
-- ============================================================

CREATE TYPE public.billing_provider AS ENUM ('none','mock','stripe','paddle','apple','google','manual');
CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','paused','canceled','expired','incomplete');
CREATE TYPE public.billing_interval AS ENUM ('month','year');
CREATE TYPE public.entitlement_source AS ENUM ('web','ios','android','promotional','admin_grant');
CREATE TYPE public.billing_event_status AS ENUM ('received','processed','duplicate','ignored','failed');

-- ------------------------------------------------- billing_accounts
CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider public.billing_provider NOT NULL DEFAULT 'none',
  provider_customer_id text,
  currency text NOT NULL DEFAULT 'USD',
  locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_accounts_currency_len CHECK (char_length(currency) = 3)
);
CREATE UNIQUE INDEX billing_accounts_provider_customer_key
  ON public.billing_accounts (provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

GRANT SELECT ON public.billing_accounts TO authenticated;
GRANT ALL ON public.billing_accounts TO service_role;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own billing account"
  ON public.billing_accounts FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- ------------------------------------------------- subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  provider public.billing_provider NOT NULL DEFAULT 'none',
  provider_subscription_id text,
  purchase_source public.entitlement_source NOT NULL DEFAULT 'web',
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  billing_interval public.billing_interval NOT NULL DEFAULT 'month',
  currency text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_provider_ref_key
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX subscriptions_profile_status_idx ON public.subscriptions (profile_id, status);
CREATE INDEX subscriptions_period_end_idx ON public.subscriptions (current_period_end);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- ------------------------------------------------- entitlements
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  source public.entitlement_source NOT NULL DEFAULT 'web',
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  granted_by uuid,
  reason text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_key_len CHECK (char_length(key) BETWEEN 2 AND 64)
);
CREATE UNIQUE INDEX entitlements_subscription_key
  ON public.entitlements (subscription_id, key)
  WHERE subscription_id IS NOT NULL;
CREATE INDEX entitlements_profile_key_idx ON public.entitlements (profile_id, key);
CREATE INDEX entitlements_expiry_idx ON public.entitlements (expires_at);

GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own entitlements"
  ON public.entitlements FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- ------------------------------------------------- billing_events (ledger)
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.billing_provider NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status public.billing_event_status NOT NULL DEFAULT 'received',
  signature_verified boolean NOT NULL DEFAULT false,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_events_provider_event_key
  ON public.billing_events (provider, provider_event_id);
CREATE INDEX billing_events_received_idx ON public.billing_events (received_at DESC);

-- No member-facing access at all: the ledger is trusted-server only.
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Append-only: never update or delete a ledger row's identity fields.
CREATE OR REPLACE FUNCTION public.guard_billing_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'billing_events is append-only';
  END IF;
  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.payload_summary IS DISTINCT FROM OLD.payload_summary THEN
    RAISE EXCEPTION 'billing_events identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_events_append_only
  BEFORE UPDATE OR DELETE ON public.billing_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_event_mutation();

-- ------------------------------------------------- updated_at triggers
CREATE TRIGGER billing_accounts_set_updated_at BEFORE UPDATE ON public.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Entitlement resolution
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_entitlement(_user uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements e
    WHERE e.profile_id = _user
      AND e.key = _key
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
  AND public.effective_account_status(_user) = 'active';
$$;
REVOKE ALL ON FUNCTION public.has_entitlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid, text) TO authenticated, service_role;

-- The caller's own entitlements; the viewer is always derived from the session.
CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS TABLE (key text, source public.entitlement_source, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.key, e.source, e.expires_at
  FROM public.entitlements e
  WHERE e.profile_id = auth.uid()
    AND e.revoked_at IS NULL
    AND e.starts_at <= now()
    AND (e.expires_at IS NULL OR e.expires_at > now())
    AND public.effective_account_status(auth.uid()) = 'active'
  ORDER BY e.key;
$$;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated, service_role;

-- ============================================================
-- Staff billing visibility
-- ============================================================
INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','billing.view'),
  ('super_admin','billing.grant'),
  ('moderator','billing.view.limited'),
  ('support','billing.view.limited')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_billing_overview(p_profile uuid)
RETURNS TABLE (
  profile_id uuid,
  plan_code text,
  provider public.billing_provider,
  purchase_source public.entitlement_source,
  status public.subscription_status,
  billing_interval public.billing_interval,
  currency text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  trial_ends_at timestamptz,
  provider_subscription_id text,
  entitlement_keys text[],
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full boolean;
BEGIN
  v_full := public.has_permission(auth.uid(), 'billing.view');
  IF NOT v_full AND NOT public.has_permission(auth.uid(), 'billing.view.limited') THEN
    RAISE EXCEPTION 'forbidden: billing.view';
  END IF;

  RETURN QUERY
  SELECT s.profile_id,
         s.plan_code,
         s.provider,
         s.purchase_source,
         s.status,
         s.billing_interval,
         s.currency,
         s.current_period_start,
         s.current_period_end,
         s.cancel_at_period_end,
         s.canceled_at,
         s.trial_ends_at,
         CASE WHEN v_full THEN s.provider_subscription_id ELSE NULL END,
         COALESCE((
           SELECT array_agg(e.key ORDER BY e.key)
           FROM public.entitlements e
           WHERE e.profile_id = s.profile_id
             AND e.revoked_at IS NULL
             AND (e.expires_at IS NULL OR e.expires_at > now())
         ), ARRAY[]::text[]),
         s.created_at
  FROM public.subscriptions s
  WHERE s.profile_id = p_profile
  ORDER BY s.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_billing_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_billing_overview(uuid) TO authenticated, service_role;

-- ============================================================
-- Administrative Premium grants (super_admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_grant_entitlement(
  p_target uuid,
  p_key text,
  p_days integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  v_actor := public.require_permission('billing.grant');

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'a reason is required for an administrative grant';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'an administrative grant requires an expiry between 1 and 365 days';
  END IF;
  IF p_key IS NULL OR char_length(btrim(p_key)) < 2 THEN
    RAISE EXCEPTION 'invalid entitlement key';
  END IF;

  v_expires := now() + make_interval(days => p_days);

  INSERT INTO public.entitlements
    (profile_id, key, source, granted_by, reason, expires_at, metadata)
  VALUES
    (p_target, btrim(p_key), 'admin_grant', v_actor, btrim(p_reason), v_expires,
     jsonb_build_object('granted_days', p_days))
  RETURNING id INTO v_id;

  PERFORM public.write_audit(
    v_actor, 'ENTITLEMENT_GRANTED', 'entitlement', v_id, NULL, btrim(p_reason),
    jsonb_build_object('profile_id', p_target, 'key', btrim(p_key), 'expires_at', v_expires)
  );

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_grant_entitlement(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_entitlement(uuid, text, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_entitlement(p_entitlement uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_profile uuid;
  v_key text;
BEGIN
  v_actor := public.require_permission('billing.grant');
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'a reason is required to revoke an entitlement';
  END IF;

  UPDATE public.entitlements
     SET revoked_at = now(), revoke_reason = btrim(p_reason)
   WHERE id = p_entitlement AND revoked_at IS NULL
  RETURNING profile_id, key INTO v_profile, v_key;

  IF v_profile IS NULL THEN
    RETURN false;
  END IF;

  PERFORM public.write_audit(
    v_actor, 'ENTITLEMENT_REVOKED', 'entitlement', p_entitlement, NULL, btrim(p_reason),
    jsonb_build_object('profile_id', v_profile, 'key', v_key)
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revoke_entitlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_entitlement(uuid, text) TO authenticated, service_role;

-- ============================================================
-- Trusted-server billing application (service role only)
-- Webhook handlers call this after verifying the provider signature.
-- ============================================================
CREATE OR REPLACE FUNCTION public.billing_apply_subscription(
  p_profile uuid,
  p_provider public.billing_provider,
  p_provider_subscription_id text,
  p_plan_code text,
  p_status public.subscription_status,
  p_interval public.billing_interval,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_entitlements text[],
  p_source public.entitlement_source
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_sub uuid;
  v_key text;
  v_active boolean;
  v_expires timestamptz;
BEGIN
  INSERT INTO public.billing_accounts (profile_id, provider, currency)
  VALUES (p_profile, p_provider, COALESCE(p_currency, 'USD'))
  ON CONFLICT (profile_id) DO UPDATE SET provider = EXCLUDED.provider, updated_at = now()
  RETURNING id INTO v_account;

  INSERT INTO public.subscriptions (
    billing_account_id, profile_id, plan_code, provider, provider_subscription_id,
    purchase_source, status, billing_interval, currency,
    current_period_start, current_period_end, cancel_at_period_end,
    canceled_at, ended_at
  ) VALUES (
    v_account, p_profile, p_plan_code, p_provider, p_provider_subscription_id,
    COALESCE(p_source, 'web'), p_status, p_interval, p_currency,
    p_period_start, p_period_end, COALESCE(p_cancel_at_period_end, false),
    CASE WHEN p_status IN ('canceled','expired') THEN now() ELSE NULL END,
    CASE WHEN p_status = 'expired' THEN now() ELSE NULL END
  )
  ON CONFLICT (provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL
  DO UPDATE SET
    plan_code = EXCLUDED.plan_code,
    status = EXCLUDED.status,
    billing_interval = EXCLUDED.billing_interval,
    currency = EXCLUDED.currency,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    canceled_at = CASE WHEN EXCLUDED.status IN ('canceled','expired')
                       THEN COALESCE(public.subscriptions.canceled_at, now()) ELSE NULL END,
    ended_at = CASE WHEN EXCLUDED.status = 'expired'
                    THEN COALESCE(public.subscriptions.ended_at, now()) ELSE NULL END,
    updated_at = now()
  RETURNING id INTO v_sub;

  -- Entitlement follows the subscription's真 state, never the client's claim.
  v_active := p_status IN ('trialing','active','past_due','paused')
              OR (p_status = 'canceled' AND p_period_end IS NOT NULL AND p_period_end > now());
  v_expires := p_period_end;

  FOREACH v_key IN ARRAY COALESCE(p_entitlements, ARRAY[]::text[]) LOOP
    INSERT INTO public.entitlements (profile_id, key, source, subscription_id, expires_at)
    VALUES (p_profile, v_key, COALESCE(p_source, 'web'), v_sub,
            CASE WHEN v_active THEN v_expires ELSE now() END)
    ON CONFLICT (subscription_id, key) WHERE subscription_id IS NOT NULL
    DO UPDATE SET
      expires_at = CASE WHEN v_active THEN v_expires ELSE now() END,
      revoked_at = NULL,
      updated_at = now();
  END LOOP;

  IF NOT v_active THEN
    UPDATE public.entitlements
       SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
     WHERE subscription_id = v_sub AND revoked_at IS NULL;
  END IF;

  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_apply_subscription(uuid, public.billing_provider, text, text, public.subscription_status, public.billing_interval, text, timestamptz, timestamptz, boolean, text[], public.entitlement_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply_subscription(uuid, public.billing_provider, text, text, public.subscription_status, public.billing_interval, text, timestamptz, timestamptz, boolean, text[], public.entitlement_source) TO service_role;

-- Refund / chargeback: revoke immediately.
CREATE OR REPLACE FUNCTION public.billing_revoke_subscription_entitlements(
  p_provider public.billing_provider,
  p_provider_subscription_id text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_sub FROM public.subscriptions
   WHERE provider = p_provider AND provider_subscription_id = p_provider_subscription_id;
  IF v_sub IS NULL THEN RETURN 0; END IF;

  UPDATE public.subscriptions
     SET status = 'canceled', ended_at = now(), canceled_at = COALESCE(canceled_at, now()), updated_at = now()
   WHERE id = v_sub;

  UPDATE public.entitlements
     SET revoked_at = now(), revoke_reason = COALESCE(p_reason, 'refund'), updated_at = now()
   WHERE subscription_id = v_sub AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_revoke_subscription_entitlements(public.billing_provider, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_revoke_subscription_entitlements(public.billing_provider, text, text) TO service_role;