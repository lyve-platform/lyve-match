REVOKE ALL ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO service_role;