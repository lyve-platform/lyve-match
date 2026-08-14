-- Reporter identity is a separate, narrower permission.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','reports.reporter.view'),
  ('moderator','reports.reporter.view')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.require_permission(_permission text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_permission(actor, _permission) THEN
    RAISE EXCEPTION 'FORBIDDEN: missing permission %', _permission USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_audit(
  _actor uuid, _action text, _target_type text, _target_id uuid,
  _case uuid DEFAULT NULL, _reason text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, case_id, reason, metadata)
  VALUES (_actor, _action, _target_type, _target_id, _case, nullif(btrim(coalesce(_reason,'')),''), coalesce(_metadata,'{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ============ METRICS ============
CREATE OR REPLACE FUNCTION public.admin_metrics()
RETURNS TABLE(total_users bigint, active_users bigint, new_users_7d bigint, active_30d bigint,
  pending_reports bigint, open_cases bigint, suspended_accounts bigint, banned_accounts bigint,
  restricted_accounts bigint, deleted_accounts bigint, blocks_total bigint, reports_total bigint,
  block_rate numeric, report_rate numeric, open_appeals bigint, high_risk_signals_7d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE total bigint;
BEGIN
  PERFORM public.require_permission('metrics.view');
  SELECT count(*) INTO total FROM public.profiles WHERE deleted_at IS NULL;

  RETURN QUERY
  SELECT
    total,
    (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND account_status = 'active'),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND last_active_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.reports WHERE status = 'open')
      + (SELECT count(*) FROM public.message_reports WHERE status = 'open'),
    (SELECT count(*) FROM public.moderation_cases WHERE status IN ('open','investigating','action_required')),
    (SELECT count(*) FROM public.profiles WHERE account_status = 'suspended'),
    (SELECT count(*) FROM public.profiles WHERE account_status = 'banned'),
    (SELECT count(*) FROM public.profiles WHERE account_status = 'restricted'),
    (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
    (SELECT count(*) FROM public.blocks),
    (SELECT count(*) FROM public.reports) + (SELECT count(*) FROM public.message_reports),
    CASE WHEN total = 0 THEN 0 ELSE round(((SELECT count(*) FROM public.blocks))::numeric / total, 4) END,
    CASE WHEN total = 0 THEN 0 ELSE round((((SELECT count(*) FROM public.reports) + (SELECT count(*) FROM public.message_reports)))::numeric / total, 4) END,
    (SELECT count(*) FROM public.account_appeals WHERE status IN ('pending','reviewing')),
    (SELECT count(*) FROM public.safety_signals WHERE risk_level = 'high' AND created_at > now() - interval '7 days');
END;
$$;

-- ============ USER LIST (SAFE PROJECTION) ============
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_status public.account_status DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, first_name text, account_status public.account_status,
  effective_status public.account_status, suspended_until timestamptz, status_reason text,
  profile_complete boolean, photo_count integer, created_at timestamptz, last_active_at timestamptz,
  deleted_at timestamptz, report_count bigint, block_count bigint, open_case_id uuid,
  open_case_status public.moderation_case_status)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),100);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM public.require_permission('users.view');
  RETURN QUERY
  SELECT p.id, p.first_name, p.account_status, public.effective_account_status(p.id),
    p.suspended_until, p.status_reason,
    coalesce((SELECT op.is_complete FROM public.onboarding_progress op WHERE op.profile_id = p.id), false),
    (SELECT count(*)::int FROM public.profile_photos ph WHERE ph.profile_id = p.id),
    p.created_at, p.last_active_at, p.deleted_at,
    (SELECT count(*) FROM public.reports r WHERE r.reported_id = p.id)
      + (SELECT count(*) FROM public.message_reports mr WHERE mr.reported_id = p.id),
    (SELECT count(*) FROM public.blocks b WHERE b.blocked_id = p.id),
    (SELECT mc.id FROM public.moderation_cases mc WHERE mc.subject_id = p.id
       AND mc.status IN ('open','investigating','action_required') LIMIT 1),
    (SELECT mc.status FROM public.moderation_cases mc WHERE mc.subject_id = p.id
       AND mc.status IN ('open','investigating','action_required') LIMIT 1)
  FROM public.profiles p
  WHERE (p_status IS NULL OR p.account_status = p_status)
  ORDER BY p.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

-- ============ CASE QUEUE ============
CREATE OR REPLACE FUNCTION public.admin_list_cases(
  p_status public.moderation_case_status DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(case_id uuid, case_number bigint, subject_id uuid, subject_name text,
  subject_status public.account_status, source public.moderation_source, category public.report_category,
  status public.moderation_case_status, priority public.moderation_priority, report_count integer,
  signal_count integer, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),100);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM public.require_permission('cases.view');
  RETURN QUERY
  SELECT c.id, c.case_number, c.subject_id, p.first_name, p.account_status, c.source, c.category,
    c.status, c.priority, c.report_count, c.signal_count, c.created_at, c.updated_at
  FROM public.moderation_cases c
  JOIN public.profiles p ON p.id = c.subject_id
  WHERE (p_status IS NULL OR c.status = p_status)
  ORDER BY (c.status IN ('open','investigating','action_required')) DESC, c.priority DESC, c.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_case_reports(p_case uuid)
RETURNS TABLE(report_id uuid, kind text, category public.report_category, description text,
  status public.report_status, reporter_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE subject uuid; show_reporter boolean;
BEGIN
  PERFORM public.require_permission('reports.view');
  show_reporter := public.has_permission(auth.uid(), 'reports.reporter.view');
  SELECT c.subject_id INTO subject FROM public.moderation_cases c WHERE c.id = p_case;
  IF subject IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.id, 'profile'::text, r.category, r.description, r.status,
         CASE WHEN show_reporter THEN r.reporter_id ELSE NULL END, r.created_at
  FROM public.reports r WHERE r.reported_id = subject
  UNION ALL
  SELECT mr.id, 'message'::text, mr.category, mr.description, mr.status,
         CASE WHEN show_reporter THEN mr.reporter_id ELSE NULL END, mr.created_at
  FROM public.message_reports mr WHERE mr.reported_id = subject
  ORDER BY 7 DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_case_signals(p_case uuid)
RETURNS TABLE(signal_id uuid, risk_level public.safety_risk_level, categories text[],
  screener text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE subject uuid;
BEGIN
  PERFORM public.require_permission('signals.view');
  SELECT c.subject_id INTO subject FROM public.moderation_cases c WHERE c.id = p_case;
  IF subject IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.id, s.risk_level, s.categories, s.screener, s.created_at
  FROM public.safety_signals s WHERE s.subject_id = subject
  ORDER BY s.created_at DESC LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_case(
  p_case uuid, p_status public.moderation_case_status DEFAULT NULL,
  p_priority public.moderation_priority DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; before_row public.moderation_cases;
BEGIN
  actor := public.require_permission('cases.manage');
  SELECT * INTO before_row FROM public.moderation_cases WHERE id = p_case;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.moderation_cases
  SET status = coalesce(p_status, status),
      priority = coalesce(p_priority, priority),
      resolution_note = coalesce(nullif(btrim(coalesce(p_note,'')),''), resolution_note),
      assigned_to = coalesce(assigned_to, actor),
      resolved_at = CASE WHEN coalesce(p_status, status) IN ('resolved','dismissed') THEN now() ELSE resolved_at END
  WHERE id = p_case;

  PERFORM public.write_audit(actor, 'CASE_UPDATED', 'moderation_case', p_case, p_case, p_note,
    jsonb_build_object('from_status', before_row.status, 'to_status', coalesce(p_status, before_row.status),
                       'from_priority', before_row.priority, 'to_priority', coalesce(p_priority, before_row.priority)));
  RETURN p_case;
END;
$$;

-- ============ MODERATION ACTIONS ============
CREATE OR REPLACE FUNCTION public.admin_moderate_account(
  p_target uuid, p_action text, p_reason text DEFAULT NULL,
  p_case uuid DEFAULT NULL, p_days integer DEFAULT NULL)
RETURNS public.account_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  action_key text := lower(btrim(coalesce(p_action, '')));
  required text;
  audit_action text;
  new_status public.account_status;
  until timestamptz;
  before_status public.account_status;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  required := CASE action_key
    WHEN 'review' THEN 'action.review'
    WHEN 'dismiss' THEN 'action.dismiss'
    WHEN 'restrict' THEN 'action.restrict'
    WHEN 'suspend' THEN 'action.suspend'
    WHEN 'ban' THEN 'action.ban'
    WHEN 'restore' THEN 'action.restore'
    ELSE NULL END;
  IF required IS NULL THEN
    RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.require_permission(required);

  SELECT p.account_status INTO before_status FROM public.profiles p WHERE p.id = p_target;
  IF before_status IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_target = actor THEN
    RAISE EXCEPTION 'FORBIDDEN: staff cannot moderate their own account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  new_status := before_status;
  audit_action := CASE action_key
    WHEN 'review' THEN 'ADMIN_REVIEWED_REPORT'
    WHEN 'dismiss' THEN 'REPORT_DISMISSED'
    WHEN 'restrict' THEN 'USER_RESTRICTED'
    WHEN 'suspend' THEN 'USER_SUSPENDED'
    WHEN 'ban' THEN 'USER_BANNED'
    WHEN 'restore' THEN 'USER_RESTORED' END;

  IF action_key IN ('restrict','suspend','ban','restore') THEN
    new_status := CASE action_key
      WHEN 'restrict' THEN 'restricted'
      WHEN 'suspend' THEN 'suspended'
      WHEN 'ban' THEN 'banned'
      ELSE 'active' END::public.account_status;
    IF action_key = 'suspend' THEN
      until := now() + (least(greatest(coalesce(p_days, 7), 1), 365) || ' days')::interval;
    END IF;

    UPDATE public.profiles
    SET account_status = new_status,
        status_reason = nullif(btrim(coalesce(p_reason,'')),''),
        status_changed_at = now(),
        suspended_until = CASE WHEN action_key = 'suspend' THEN until ELSE NULL END
    WHERE id = p_target;
  END IF;

  IF action_key IN ('ban','suspend','restrict') THEN
    UPDATE public.matches SET status = 'unmatched', ended_by = NULL, ended_at = now()
    WHERE (profile_a = p_target OR profile_b = p_target) AND status = 'active' AND action_key = 'ban';
  END IF;

  IF p_case IS NOT NULL THEN
    UPDATE public.moderation_cases
    SET status = CASE action_key
          WHEN 'review' THEN 'investigating'
          WHEN 'dismiss' THEN 'dismissed'
          WHEN 'restore' THEN 'resolved'
          ELSE 'resolved' END::public.moderation_case_status,
        assigned_to = coalesce(assigned_to, actor),
        resolution_note = coalesce(nullif(btrim(coalesce(p_reason,'')),''), resolution_note),
        resolved_at = CASE WHEN action_key = 'review' THEN resolved_at ELSE now() END
    WHERE id = p_case;
  END IF;

  IF action_key = 'dismiss' THEN
    UPDATE public.reports SET status = 'dismissed' WHERE reported_id = p_target AND status IN ('open','reviewing');
    UPDATE public.message_reports SET status = 'dismissed' WHERE reported_id = p_target AND status IN ('open','reviewing');
  ELSIF action_key IN ('restrict','suspend','ban') THEN
    UPDATE public.reports SET status = 'actioned' WHERE reported_id = p_target AND status IN ('open','reviewing');
    UPDATE public.message_reports SET status = 'actioned' WHERE reported_id = p_target AND status IN ('open','reviewing');
  END IF;

  PERFORM public.write_audit(actor, audit_action, 'profile', p_target, p_case, p_reason,
    jsonb_build_object('from_status', before_status, 'to_status', new_status,
                       'suspended_until', until, 'action', action_key));
  RETURN new_status;
END;
$$;

-- ============ ROLE MANAGEMENT ============
CREATE OR REPLACE FUNCTION public.admin_set_role(p_target uuid, p_role public.app_role, p_grant boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
BEGIN
  actor := public.require_permission('roles.manage');
  IF p_target = actor THEN
    RAISE EXCEPTION 'FORBIDDEN: staff cannot change their own roles' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role, granted_by) VALUES (p_target, p_role, actor)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_target AND role = p_role;
  END IF;

  PERFORM public.write_audit(actor, 'ROLE_CHANGED', 'profile', p_target, NULL, NULL,
    jsonb_build_object('role', p_role, 'granted', p_grant));
  RETURN true;
END;
$$;

-- ============ AUDIT + APPEALS ============
CREATE OR REPLACE FUNCTION public.admin_list_audit(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, actor_id uuid, actor_name text, action text, target_type text,
  target_id uuid, case_id uuid, reason text, metadata jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),200);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM public.require_permission('audit.view');
  RETURN QUERY
  SELECT a.id, a.actor_id, p.first_name, a.action, a.target_type, a.target_id, a.case_id,
         a.reason, a.metadata, a.created_at
  FROM public.admin_audit_logs a
  LEFT JOIN public.profiles p ON p.id = a.actor_id
  ORDER BY a.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_appeals(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, profile_id uuid, first_name text, account_status public.account_status,
  status public.appeal_status, body text, decision_note text, created_at timestamptz, decided_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),100);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM public.require_permission('appeals.view');
  RETURN QUERY
  SELECT a.id, a.profile_id, p.first_name, p.account_status, a.status, a.body, a.decision_note,
         a.created_at, a.decided_at
  FROM public.account_appeals a
  JOIN public.profiles p ON p.id = a.profile_id
  ORDER BY (a.status = 'pending') DESC, a.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_appeal(p_appeal uuid, p_status public.appeal_status, p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; subject uuid;
BEGIN
  actor := public.require_permission('appeals.decide');
  IF p_status NOT IN ('reviewing','granted','denied') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = 'check_violation';
  END IF;

  SELECT profile_id INTO subject FROM public.account_appeals WHERE id = p_appeal;
  IF subject IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.account_appeals
  SET status = p_status,
      decision_note = nullif(btrim(coalesce(p_note,'')),''),
      decided_by = CASE WHEN p_status = 'reviewing' THEN NULL ELSE actor END,
      decided_at = CASE WHEN p_status = 'reviewing' THEN NULL ELSE now() END
  WHERE id = p_appeal;

  PERFORM public.write_audit(actor, 'APPEAL_DECIDED', 'account_appeal', p_appeal, NULL, p_note,
    jsonb_build_object('status', p_status, 'profile_id', subject));
  RETURN true;
END;
$$;

-- ============ SAFETY SIGNAL ESCALATION (ADVISORY ONLY) ============
CREATE OR REPLACE FUNCTION public.escalate_safety_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid;
BEGIN
  IF NEW.risk_level NOT IN ('medium','high') THEN RETURN NULL; END IF;

  SELECT id INTO existing FROM public.moderation_cases
  WHERE subject_id = NEW.subject_id AND status IN ('open','investigating','action_required') LIMIT 1;

  IF existing IS NULL THEN
    INSERT INTO public.moderation_cases (subject_id, source, priority, signal_count, report_count)
    VALUES (NEW.subject_id, 'safety_signal',
            CASE WHEN NEW.risk_level = 'high' THEN 'high' ELSE 'medium' END::public.moderation_priority, 1, 0)
    RETURNING id INTO existing;
  ELSE
    UPDATE public.moderation_cases
    SET signal_count = signal_count + 1,
        priority = CASE WHEN NEW.risk_level = 'high' AND priority < 'high' THEN 'high'::public.moderation_priority ELSE priority END,
        updated_at = now()
    WHERE id = existing;
  END IF;

  UPDATE public.safety_signals SET case_id = existing WHERE id = NEW.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER safety_signals_escalate AFTER INSERT ON public.safety_signals
  FOR EACH ROW EXECUTE FUNCTION public.escalate_safety_signal();

-- ============ 30-DAY PURGE (MAINTENANCE ONLY) ============
CREATE OR REPLACE FUNCTION public.purge_expired_accounts(p_dry_run boolean DEFAULT false)
RETURNS TABLE(purged_profile_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target record;
BEGIN
  -- Never reachable by a signed-in caller: EXECUTE is granted to service_role only,
  -- and this belt-and-braces check rejects any session-bound invocation.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: purge is a maintenance routine' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR target IN
    SELECT dr.profile_id
    FROM public.account_deletion_requests dr
    JOIN public.profiles p ON p.id = dr.profile_id
    WHERE dr.status = 'pending'
      AND dr.scheduled_purge_at <= now()
      AND p.deleted_at IS NOT NULL
      AND p.deleted_at <= now() - interval '30 days'
    ORDER BY dr.scheduled_purge_at
    LIMIT 500
  LOOP
    IF p_dry_run THEN
      purged_profile_id := target.profile_id;
      RETURN NEXT;
      CONTINUE;
    END IF;

    UPDATE public.messages SET body = NULL, deleted_at = coalesce(deleted_at, now())
    WHERE sender_id = target.profile_id;

    DELETE FROM public.profile_photos WHERE profile_id = target.profile_id;
    DELETE FROM public.profile_interests WHERE profile_id = target.profile_id;
    DELETE FROM public.likes WHERE liker_id = target.profile_id OR likee_id = target.profile_id;
    DELETE FROM public.passes WHERE passer_id = target.profile_id OR passed_id = target.profile_id;

    UPDATE public.account_deletion_requests
    SET status = 'completed', processed_at = now()
    WHERE profile_id = target.profile_id AND status = 'pending';

    UPDATE public.profiles
    SET first_name = NULL, bio = NULL, occupation = NULL, education = NULL,
        city = NULL, country = NULL, approx_latitude = NULL, approx_longitude = NULL,
        gender = NULL, relationship_intent = NULL, smoking = NULL, drinking = NULL,
        exercise = NULL, children = NULL, social_energy = NULL, communication_style = NULL,
        account_status = 'deleted', status_changed_at = now()
    WHERE id = target.profile_id;

    PERFORM public.write_audit(NULL, 'ACCOUNT_PURGED', 'profile', target.profile_id, NULL,
      '30-day retention window elapsed', jsonb_build_object('automated', true));

    purged_profile_id := target.profile_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============ PRIVILEGES ============
REVOKE ALL ON FUNCTION public.require_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit(uuid, text, text, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(public.account_status, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_cases(public.moderation_case_status, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_case_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_case_signals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_case(uuid, public.moderation_case_status, public.moderation_priority, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_moderate_account(uuid, text, text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_appeals(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_decide_appeal(uuid, public.appeal_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_accounts(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escalate_safety_signal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_case_for_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_appeal_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deny_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_priority(public.report_category) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.require_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit(uuid, text, text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(public.account_status, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_cases(public.moderation_case_status, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_reports(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_signals(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_case(uuid, public.moderation_case_status, public.moderation_priority, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_account(uuid, text, text, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_appeals(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_appeal(uuid, public.appeal_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_accounts(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.category_priority(public.report_category) TO authenticated, service_role;