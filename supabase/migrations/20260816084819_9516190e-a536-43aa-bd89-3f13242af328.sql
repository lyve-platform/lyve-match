CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE (user_id uuid, role app_role, granted_by uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  PERFORM private.require_permission('roles.manage');
  RETURN QUERY
    SELECT ur.user_id, ur.role, ur.granted_by, ur.created_at
    FROM public.user_roles ur
    ORDER BY ur.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;