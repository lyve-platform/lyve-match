REVOKE EXECUTE ON FUNCTION public.nickname_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nickname_available(text) TO authenticated, service_role;