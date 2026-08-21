-- ============ SECURITY MONITORING & ALERTS ============

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  actor_id uuid,
  target_id uuid,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS security_alerts_created_idx ON public.security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS security_alerts_actor_idx ON public.security_alerts (actor_id, kind, created_at DESC);

GRANT SELECT ON public.security_alerts TO authenticated;
GRANT ALL ON public.security_alerts TO service_role;

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Security staff can read alerts" ON public.security_alerts;
CREATE POLICY "Security staff can read alerts"
  ON public.security_alerts FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'security.view'));

INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','security.view'),
  ('super_admin','security.ack')
ON CONFLICT (role, permission) DO NOTHING;

-- Internal writer. Never client-reachable.
CREATE OR REPLACE FUNCTION public.record_security_alert(
  p_kind text, p_severity text, p_actor uuid, p_target uuid, p_summary text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.security_alerts (kind, severity, actor_id, target_id, summary, metadata)
  VALUES (p_kind,
          CASE WHEN p_severity IN ('info','warning','critical') THEN p_severity ELSE 'warning' END,
          p_actor, p_target, p_summary, coalesce(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_security_alert(text, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_alert(text, text, uuid, uuid, text, jsonb) TO service_role;

-- Alert on every staff role grant/revoke.
CREATE OR REPLACE FUNCTION public.alert_on_role_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_security_alert('role.granted','critical', NEW.granted_by, NEW.user_id,
      format('Staff role %s granted', NEW.role), jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.record_security_alert('role.revoked','warning', auth.uid(), OLD.user_id,
      format('Staff role %s revoked', OLD.role), jsonb_build_object('role', OLD.role));
    RETURN OLD;
  ELSE
    PERFORM public.record_security_alert('role.changed','critical', auth.uid(), NEW.user_id,
      format('Staff role changed to %s', NEW.role),
      jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    RETURN NEW;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_on_role_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alert_on_role_change ON public.user_roles;
CREATE TRIGGER trg_alert_on_role_change
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.alert_on_role_change();

-- Alert on high-privilege admin actions and on action bursts.
CREATE OR REPLACE FUNCTION public.alert_on_privileged_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sev text;
  v_recent integer;
  v_dupe boolean;
BEGIN
  v_sev := CASE
    WHEN NEW.action IN ('ROLE_CHANGED','ENTITLEMENT_GRANTED','ACCOUNT_BANNED','PAYMENTS_SETTING_CHANGED') THEN 'critical'
    WHEN NEW.action IN ('ENTITLEMENT_REVOKED','ACCOUNT_SUSPENDED','LOCALIZATION_SETTING_CHANGED','SUPPORT_TICKET_DELETED') THEN 'warning'
    ELSE NULL END;

  IF v_sev IS NOT NULL THEN
    PERFORM public.record_security_alert('privileged.action', v_sev, NEW.actor_id, NEW.target_id,
      format('Privileged admin action: %s', NEW.action),
      jsonb_build_object('action', NEW.action, 'target_type', NEW.target_type, 'audit_id', NEW.id));
  END IF;

  IF NEW.actor_id IS NOT NULL THEN
    SELECT count(*) INTO v_recent
    FROM public.admin_audit_logs a
    WHERE a.actor_id = NEW.actor_id AND a.created_at > now() - interval '5 minutes';

    IF v_recent > 25 THEN
      SELECT EXISTS (
        SELECT 1 FROM public.security_alerts s
        WHERE s.kind = 'admin.burst' AND s.actor_id = NEW.actor_id
          AND s.created_at > now() - interval '5 minutes'
      ) INTO v_dupe;

      IF NOT v_dupe THEN
        PERFORM public.record_security_alert('admin.burst','critical', NEW.actor_id, NULL,
          format('Unusual admin activity: %s actions in 5 minutes', v_recent),
          jsonb_build_object('actions_5m', v_recent));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_on_privileged_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alert_on_privileged_audit ON public.admin_audit_logs;
CREATE TRIGGER trg_alert_on_privileged_audit
AFTER INSERT ON public.admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.alert_on_privileged_audit();

-- Admin read surface.
CREATE OR REPLACE FUNCTION public.admin_list_security_alerts(
  p_severity text DEFAULT NULL, p_unacknowledged_only boolean DEFAULT false,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, kind text, severity text, actor_id uuid, actor_name text, target_id uuid,
  summary text, metadata jsonb, created_at timestamptz, acknowledged_at timestamptz, acknowledged_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),200);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM public.require_permission('security.view');
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
  PERFORM public.require_permission('security.ack');
  UPDATE public.security_alerts
     SET acknowledged_by = actor, acknowledged_at = now()
   WHERE id = p_alert AND acknowledged_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_acknowledge_security_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acknowledge_security_alert(uuid) TO authenticated, service_role;

-- Least-privilege report over every public function.
CREATE OR REPLACE FUNCTION public.admin_function_privilege_report()
RETURNS TABLE(function_name text, arguments text, security_type text,
  anon_execute boolean, authenticated_execute boolean, service_role_execute boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_permission('security.view');
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