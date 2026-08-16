CREATE OR REPLACE FUNCTION public.admin_billing_setting()
RETURNS TABLE(payments_enabled boolean, updated_at timestamptz, updated_by uuid, updated_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.require_permission('admin.access');
  RETURN QUERY
  SELECT coalesce((s.value ->> 'payments_enabled')::boolean, false),
         s.updated_at, s.updated_by, p.first_name
  FROM public.app_settings s
  LEFT JOIN public.profiles p ON p.id = s.updated_by
  WHERE s.key = 'billing';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_billing_setting() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_billing_setting() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_payments_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
        previous boolean;
BEGIN
  actor := private.require_permission('settings.billing');
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'INVALID_VALUE' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce((value ->> 'payments_enabled')::boolean, false) INTO previous
  FROM public.app_settings WHERE key = 'billing' FOR UPDATE;

  INSERT INTO public.app_settings (key, value, updated_by)
  VALUES ('billing', jsonb_build_object('payments_enabled', p_enabled), actor)
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('payments_enabled', p_enabled),
        updated_by = actor,
        updated_at = now();

  PERFORM public.write_audit(actor, 'SETTING_CHANGED', 'app_setting', NULL, NULL, NULL,
    jsonb_build_object('setting', 'billing.payments_enabled',
                       'previous_value', coalesce(previous, false),
                       'new_value', p_enabled));
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_payments_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_payments_enabled(boolean) TO authenticated, service_role;