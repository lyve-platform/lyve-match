CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks bl
    WHERE (bl.blocker_id = a AND bl.blocked_id = b)
       OR (bl.blocker_id = b AND bl.blocked_id = a)
  )
$$;

REVOKE ALL ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated, service_role;