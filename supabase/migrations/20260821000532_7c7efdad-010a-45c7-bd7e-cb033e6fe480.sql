ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- Only the account owner can record their own phone verification, and only
-- when Supabase Auth itself has confirmed the phone number for that user.
CREATE OR REPLACE FUNCTION public.sync_phone_verification()
RETURNS TABLE (phone_verified boolean, phone_hint text, verified_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text;
  v_confirmed timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.phone, u.phone_confirmed_at
    INTO v_phone, v_confirmed
    FROM auth.users u
   WHERE u.id = v_uid;

  UPDATE public.profiles p
     SET phone_verified_at = CASE WHEN v_confirmed IS NULL THEN NULL ELSE COALESCE(p.phone_verified_at, v_confirmed) END,
         updated_at = now()
   WHERE p.id = v_uid;

  RETURN QUERY
  SELECT v_confirmed IS NOT NULL,
         CASE
           WHEN v_phone IS NULL OR v_confirmed IS NULL THEN NULL
           ELSE '••••' || right(v_phone, 4)
         END,
         (SELECT p.phone_verified_at FROM public.profiles p WHERE p.id = v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_phone_verification() FROM public;
GRANT EXECUTE ON FUNCTION public.sync_phone_verification() TO authenticated;