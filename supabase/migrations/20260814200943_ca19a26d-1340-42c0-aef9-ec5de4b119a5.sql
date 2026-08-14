CREATE OR REPLACE FUNCTION public.admin_list_entitlements(p_profile uuid)
RETURNS TABLE (
  id uuid,
  key text,
  source entitlement_source,
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text,
  revoke_reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'billing.view')
     AND NOT public.has_permission(auth.uid(), 'billing.view.limited') THEN
    RAISE EXCEPTION 'forbidden: billing.view';
  END IF;

  RETURN QUERY
  SELECT e.id, e.key, e.source, e.starts_at, e.expires_at, e.revoked_at,
         e.reason, e.revoke_reason, e.created_at
  FROM public.entitlements e
  WHERE e.profile_id = p_profile
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_entitlements(uuid) TO authenticated, service_role;