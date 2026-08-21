CREATE OR REPLACE FUNCTION public.admin_list_security_alerts(
  p_severity text DEFAULT NULL, p_unacknowledged_only boolean DEFAULT false,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, kind text, severity text, actor_id uuid, actor_name text, target_id uuid,
  summary text, metadata jsonb, created_at timestamptz, acknowledged_at timestamptz, acknowledged_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),200);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM private.require_permission('security.view');
  RETURN QUERY
  SELECT s.id, s.kind, s.severity, s.actor_id, p.first_name, s.target_id, s.summary, s.metadata,
         s.created_at, s.acknowledged_at, s.acknowledged_by
  FROM public.security_alerts s
  LEFT JOIN public.profiles p ON p.id = s.actor_id
  WHERE (p_severity IS NULL OR s.severity = p_severity)
    AND (NOT coalesce(p_unacknowledged_only,false) OR s.acknowledged_at IS NULL)
  ORDER BY s.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_security_alerts(text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_security_alerts(text, boolean, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_acknowledge_security_alert(p_alert uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  PERFORM private.require_permission('security.ack');
  UPDATE public.security_alerts
     SET acknowledged_by = actor, acknowledged_at = now()
   WHERE id = p_alert AND acknowledged_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_acknowledge_security_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acknowledge_security_alert(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_function_privilege_report()
RETURNS TABLE(function_name text, arguments text, security_type text,
  anon_execute boolean, authenticated_execute boolean, service_role_execute boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Staff surface. CI uses public.security_privilege_audit() instead.
  PERFORM private.require_permission('security.view');
  RETURN QUERY
  SELECT pr.proname::text,
         pg_get_function_identity_arguments(pr.oid)::text,
         CASE WHEN pr.prosecdef THEN 'definer' ELSE 'invoker' END,
         has_function_privilege('anon', pr.oid, 'execute'),
         has_function_privilege('authenticated', pr.oid, 'execute'),
         has_function_privilege('service_role', pr.oid, 'execute')
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public'
  ORDER BY pr.proname;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_function_privilege_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_function_privilege_report() TO authenticated, service_role;

-- Machine-readable posture report for the automated CI audit. Service role only.
CREATE OR REPLACE FUNCTION public.security_privilege_audit()
RETURNS TABLE(function_name text, arguments text, security_type text,
  anon_execute boolean, authenticated_execute boolean, service_role_execute boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.proname::text,
         pg_get_function_identity_arguments(pr.oid)::text,
         CASE WHEN pr.prosecdef THEN 'definer' ELSE 'invoker' END,
         has_function_privilege('anon', pr.oid, 'execute'),
         has_function_privilege('authenticated', pr.oid, 'execute'),
         has_function_privilege('service_role', pr.oid, 'execute')
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public'
  ORDER BY pr.proname;
$$;
REVOKE ALL ON FUNCTION public.security_privilege_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_privilege_audit() TO service_role;