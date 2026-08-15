CREATE OR REPLACE FUNCTION public.inspect_purge_http_response(p_request_id bigint)
RETURNS TABLE (status_code int, purged int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.status_code,
         COALESCE(((r.content)::jsonb ->> 'purged')::int, -1)
  FROM net._http_response r
  WHERE r.id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inspect_purge_http_response(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_purge_http_response(bigint) TO service_role;