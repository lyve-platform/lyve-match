GRANT SELECT ON public.app_settings TO anon;

CREATE POLICY "Anyone can read the localization setting"
ON public.app_settings FOR SELECT
TO anon, authenticated
USING (key = 'localization');

CREATE OR REPLACE FUNCTION public.locale_availability()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT coalesce((value ->> 'arabic_enabled')::boolean, false)
  FROM public.app_settings WHERE key = 'localization';
$function$;