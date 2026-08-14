-- 1. Store purchase ownership binding -------------------------------------
CREATE TABLE public.store_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider public.billing_provider NOT NULL,
  purchase_ref text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  plan_code text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  latest_event_id text,
  latest_event_at timestamp with time zone,
  linked_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_purchases_provider_ck CHECK (provider IN ('apple','google')),
  CONSTRAINT store_purchases_env_ck CHECK (environment IN ('sandbox','production')),
  CONSTRAINT store_purchases_ref_ck CHECK (char_length(purchase_ref) BETWEEN 4 AND 400),
  CONSTRAINT store_purchases_unique_ref UNIQUE (provider, purchase_ref)
);

CREATE INDEX store_purchases_profile_idx ON public.store_purchases (profile_id);

GRANT SELECT ON public.store_purchases TO authenticated;
GRANT ALL ON public.store_purchases TO service_role;

ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own store purchases"
  ON public.store_purchases FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE TRIGGER update_store_purchases_updated_at
  BEFORE UPDATE ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Append-only store purchase audit trail ---------------------------------
CREATE TABLE public.store_purchase_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider public.billing_provider NOT NULL,
  purchase_ref_hash text NOT NULL,
  outcome text NOT NULL,
  attempted_profile_id uuid,
  owner_profile_id uuid,
  event_type text,
  event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX store_purchase_audit_created_idx ON public.store_purchase_audit (created_at DESC);

GRANT ALL ON public.store_purchase_audit TO service_role;

ALTER TABLE public.store_purchase_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.store_purchase_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'store_purchase_audit is append-only';
END;
$$;

CREATE TRIGGER store_purchase_audit_no_update
  BEFORE UPDATE ON public.store_purchase_audit
  FOR EACH ROW EXECUTE FUNCTION public.store_purchase_audit_immutable();

CREATE TRIGGER store_purchase_audit_no_delete
  BEFORE DELETE ON public.store_purchase_audit
  FOR EACH ROW EXECUTE FUNCTION public.store_purchase_audit_immutable();

-- 3. Ownership-safe linking -------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_link_store_purchase(
  p_provider public.billing_provider,
  p_purchase_ref text,
  p_profile uuid,
  p_product_id text,
  p_plan_code text,
  p_environment text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_outcome text;
BEGIN
  IF p_provider NOT IN ('apple','google') THEN
    RAISE EXCEPTION 'unsupported store provider';
  END IF;
  IF p_profile IS NULL OR p_purchase_ref IS NULL THEN
    RAISE EXCEPTION 'missing purchase binding input';
  END IF;

  SELECT profile_id INTO v_owner
  FROM public.store_purchases
  WHERE provider = p_provider AND purchase_ref = p_purchase_ref
  FOR UPDATE;

  IF v_owner IS NULL THEN
    INSERT INTO public.store_purchases (
      provider, purchase_ref, profile_id, product_id, plan_code, environment
    ) VALUES (
      p_provider, p_purchase_ref, p_profile, p_product_id, p_plan_code,
      COALESCE(NULLIF(p_environment, ''), 'sandbox')
    );
    v_outcome := 'linked';
  ELSIF v_owner = p_profile THEN
    v_outcome := 'already_owned';
  ELSE
    v_outcome := 'owned_by_other';
  END IF;

  INSERT INTO public.store_purchase_audit (
    provider, purchase_ref_hash, outcome, attempted_profile_id, owner_profile_id, metadata
  ) VALUES (
    p_provider,
    encode(sha256(convert_to(p_provider::text || ':' || p_purchase_ref, 'utf8')), 'hex'),
    v_outcome,
    p_profile,
    COALESCE(v_owner, p_profile),
    jsonb_build_object('product_id', p_product_id, 'plan_code', p_plan_code, 'environment', p_environment)
  );

  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_link_store_purchase(public.billing_provider, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_link_store_purchase(public.billing_provider, text, uuid, text, text, text) TO service_role;

-- 4. Ordered store lifecycle application ------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_store_event(
  p_provider public.billing_provider,
  p_purchase_ref text,
  p_event_id text,
  p_event_at timestamp with time zone,
  p_status public.subscription_status,
  p_plan_code text,
  p_interval public.billing_interval,
  p_currency text,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_cancel_at_period_end boolean,
  p_entitlements text[],
  p_revoke boolean DEFAULT false,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.store_purchases%ROWTYPE;
  v_sub uuid;
  v_source public.entitlement_source;
BEGIN
  SELECT * INTO v_row
  FROM public.store_purchases
  WHERE provider = p_provider AND purchase_ref = p_purchase_ref
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    INSERT INTO public.store_purchase_audit (provider, purchase_ref_hash, outcome, event_id, metadata)
    VALUES (p_provider, encode(sha256(convert_to(p_provider::text || ':' || p_purchase_ref, 'utf8')), 'hex'),
            'unlinked_event', p_event_id, jsonb_build_object('status', p_status));
    RETURN 'unlinked';
  END IF;

  IF v_row.latest_event_at IS NOT NULL AND p_event_at IS NOT NULL
     AND p_event_at < v_row.latest_event_at THEN
    INSERT INTO public.store_purchase_audit (provider, purchase_ref_hash, outcome, owner_profile_id, event_id, metadata)
    VALUES (p_provider, encode(sha256(convert_to(p_provider::text || ':' || p_purchase_ref, 'utf8')), 'hex'),
            'stale_event', v_row.profile_id, p_event_id, jsonb_build_object('status', p_status));
    RETURN 'stale';
  END IF;

  v_source := CASE WHEN p_provider = 'apple' THEN 'ios'::public.entitlement_source
                   ELSE 'android'::public.entitlement_source END;

  IF p_revoke THEN
    PERFORM public.billing_revoke_subscription_entitlements(p_provider, p_purchase_ref, COALESCE(p_reason, 'store_revocation'));
    UPDATE public.store_purchases
       SET status = 'expired', revoked_at = now(),
           latest_event_id = p_event_id, latest_event_at = COALESCE(p_event_at, now())
     WHERE id = v_row.id;
  ELSE
    v_sub := public.billing_apply_subscription(
      v_row.profile_id, p_provider, p_purchase_ref, p_plan_code, p_status,
      p_interval, p_currency, p_period_start, p_period_end,
      COALESCE(p_cancel_at_period_end, false), p_entitlements, v_source
    );
    UPDATE public.store_purchases
       SET status = p_status, subscription_id = v_sub, plan_code = p_plan_code,
           revoked_at = NULL,
           latest_event_id = p_event_id, latest_event_at = COALESCE(p_event_at, now())
     WHERE id = v_row.id;
  END IF;

  INSERT INTO public.store_purchase_audit (provider, purchase_ref_hash, outcome, owner_profile_id, event_id, metadata)
  VALUES (p_provider, encode(sha256(convert_to(p_provider::text || ':' || p_purchase_ref, 'utf8')), 'hex'),
          CASE WHEN p_revoke THEN 'revoked' ELSE 'applied' END, v_row.profile_id, p_event_id,
          jsonb_build_object('status', p_status, 'plan_code', p_plan_code));

  RETURN CASE WHEN p_revoke THEN 'revoked' ELSE 'applied' END;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_apply_store_event(public.billing_provider, text, text, timestamp with time zone, public.subscription_status, text, public.billing_interval, text, timestamp with time zone, timestamp with time zone, boolean, text[], boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply_store_event(public.billing_provider, text, text, timestamp with time zone, public.subscription_status, text, public.billing_interval, text, timestamp with time zone, timestamp with time zone, boolean, text[], boolean, text) TO service_role;