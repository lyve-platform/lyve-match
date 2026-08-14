ALTER FUNCTION public.approx_distance_km(numeric, numeric, numeric, numeric) SET search_path = public;

DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_candidates(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.likes_received() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_matches() TO authenticated;