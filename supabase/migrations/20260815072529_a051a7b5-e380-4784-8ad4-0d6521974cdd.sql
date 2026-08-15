CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read application settings" ON public.app_settings;
CREATE POLICY "Staff can read application settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.access'));

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('localization', jsonb_build_object('arabic_enabled', false))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','settings.localization')
ON CONFLICT DO NOTHING;

-- Public, minimal read: only the effective on/off state. No actor, no timestamp.
CREATE OR REPLACE FUNCTION public.locale_availability()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((value ->> 'arabic_enabled')::boolean, false)
  FROM public.app_settings WHERE key = 'localization';
$$;

REVOKE ALL ON FUNCTION public.locale_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.locale_availability() TO anon, authenticated, service_role;

-- Staff read: status plus provenance.
CREATE OR REPLACE FUNCTION public.admin_localization_setting()
RETURNS TABLE(arabic_enabled boolean, updated_at timestamptz, updated_by uuid, updated_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_permission('admin.access');
  RETURN QUERY
  SELECT coalesce((s.value ->> 'arabic_enabled')::boolean, false),
         s.updated_at,
         s.updated_by,
         p.first_name
  FROM public.app_settings s
  LEFT JOIN public.profiles p ON p.id = s.updated_by
  WHERE s.key = 'localization';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_localization_setting() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_localization_setting() TO authenticated, service_role;

-- Write path: permission-gated and always audited.
CREATE OR REPLACE FUNCTION public.admin_set_arabic_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
        previous boolean;
BEGIN
  actor := public.require_permission('settings.localization');
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'INVALID_VALUE' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce((value ->> 'arabic_enabled')::boolean, false) INTO previous
  FROM public.app_settings WHERE key = 'localization' FOR UPDATE;

  INSERT INTO public.app_settings (key, value, updated_by)
  VALUES ('localization', jsonb_build_object('arabic_enabled', p_enabled), actor)
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('arabic_enabled', p_enabled),
        updated_by = actor,
        updated_at = now();

  PERFORM public.write_audit(actor, 'SETTING_CHANGED', 'app_setting', NULL, NULL, NULL,
    jsonb_build_object('setting', 'localization.arabic_enabled',
                       'previous_value', coalesce(previous, false),
                       'new_value', p_enabled));
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_arabic_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_arabic_enabled(boolean) TO authenticated, service_role;