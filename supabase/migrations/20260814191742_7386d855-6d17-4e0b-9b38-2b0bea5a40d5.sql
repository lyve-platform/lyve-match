-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'moderator', 'support');
CREATE TYPE public.account_status AS ENUM ('active', 'restricted', 'suspended', 'banned', 'deleted');
CREATE TYPE public.moderation_case_status AS ENUM ('open', 'investigating', 'action_required', 'resolved', 'dismissed');
CREATE TYPE public.moderation_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.moderation_source AS ENUM ('profile_report', 'message_report', 'safety_signal', 'manual');
CREATE TYPE public.appeal_status AS ENUM ('pending', 'reviewing', 'granted', 'denied');
CREATE TYPE public.safety_risk_level AS ENUM ('none', 'low', 'medium', 'high');

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER user_roles_set_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select_staff" ON public.role_permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','admin.access'),('super_admin','users.view'),('super_admin','cases.view'),
  ('super_admin','cases.manage'),('super_admin','reports.view'),('super_admin','signals.view'),
  ('super_admin','action.review'),('super_admin','action.dismiss'),('super_admin','action.restrict'),
  ('super_admin','action.suspend'),('super_admin','action.ban'),('super_admin','action.restore'),
  ('super_admin','appeals.view'),('super_admin','appeals.decide'),('super_admin','roles.manage'),
  ('super_admin','audit.view'),('super_admin','metrics.view'),('super_admin','purge.run'),
  ('moderator','admin.access'),('moderator','users.view'),('moderator','cases.view'),
  ('moderator','cases.manage'),('moderator','reports.view'),('moderator','signals.view'),
  ('moderator','action.review'),('moderator','action.dismiss'),('moderator','action.restrict'),
  ('moderator','action.suspend'),('moderator','action.restore'),('moderator','appeals.view'),
  ('moderator','audit.view'),('moderator','metrics.view'),
  ('support','admin.access'),('support','users.view'),('support','cases.view'),
  ('support','reports.view'),('support','appeals.view'),('support','metrics.view');

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission = _permission
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- ============ ACCOUNT STATUS ============
ALTER TABLE public.profiles
  ADD COLUMN account_status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN status_reason text,
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN suspended_until timestamptz;

CREATE INDEX profiles_account_status_idx ON public.profiles (account_status);

-- Members can never move their own account between states.
CREATE OR REPLACE FUNCTION public.guard_profile_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    NEW.account_status := OLD.account_status;
    NEW.status_reason := OLD.status_reason;
    NEW.status_changed_at := OLD.status_changed_at;
    NEW.suspended_until := OLD.suspended_until;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_guard_status BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status();

-- Effective status: an expired suspension behaves as active without a job run.
CREATE OR REPLACE FUNCTION public.effective_account_status(_profile uuid)
RETURNS public.account_status LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.deleted_at IS NOT NULL THEN 'deleted'::public.account_status
    WHEN p.account_status = 'suspended' AND p.suspended_until IS NOT NULL AND p.suspended_until <= now()
      THEN 'active'::public.account_status
    ELSE p.account_status
  END
  FROM public.profiles p WHERE p.id = _profile;
$$;

-- Can this account take part in social actions (like, pass, block, message)?
CREATE OR REPLACE FUNCTION public.account_can_act(_profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.effective_account_status(_profile) = 'active', false);
$$;

REVOKE ALL ON FUNCTION public.effective_account_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_can_act(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_account_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_can_act(uuid) TO authenticated, service_role;

-- ============ MODERATION CASES ============
CREATE TABLE public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number bigint GENERATED ALWAYS AS IDENTITY,
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source public.moderation_source NOT NULL,
  category public.report_category,
  status public.moderation_case_status NOT NULL DEFAULT 'open',
  priority public.moderation_priority NOT NULL DEFAULT 'medium',
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  message_report_id uuid REFERENCES public.message_reports(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  signal_count integer NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_cases TO authenticated;
GRANT ALL ON public.moderation_cases TO service_role;
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_cases_select_staff" ON public.moderation_cases FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'cases.view'));
CREATE INDEX moderation_cases_subject_idx ON public.moderation_cases (subject_id);
CREATE INDEX moderation_cases_status_idx ON public.moderation_cases (status, priority DESC, created_at DESC);
CREATE UNIQUE INDEX moderation_cases_open_subject_idx
  ON public.moderation_cases (subject_id) WHERE status IN ('open','investigating','action_required');
CREATE TRIGGER moderation_cases_set_updated_at BEFORE UPDATE ON public.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SAFETY SIGNALS ============
CREATE TABLE public.safety_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.moderation_cases(id) ON DELETE SET NULL,
  risk_level public.safety_risk_level NOT NULL DEFAULT 'low',
  categories text[] NOT NULL DEFAULT '{}',
  screener text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.safety_signals TO authenticated;
GRANT ALL ON public.safety_signals TO service_role;
ALTER TABLE public.safety_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "safety_signals_select_staff" ON public.safety_signals FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'signals.view'));
CREATE INDEX safety_signals_subject_idx ON public.safety_signals (subject_id, created_at DESC);

-- ============ AUDIT LOG (APPEND ONLY) ============
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  case_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_logs_select_staff" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.view'));
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX admin_audit_logs_target_idx ON public.admin_audit_logs (target_id, created_at DESC);

-- Append only for every role, including the service role.
CREATE OR REPLACE FUNCTION public.deny_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE: administrative audit entries cannot be % ', lower(TG_OP)
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER admin_audit_logs_no_update BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_audit_mutation();
CREATE TRIGGER admin_audit_logs_no_delete BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_audit_mutation();

-- ============ APPEALS ============
CREATE TABLE public.account_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.moderation_cases(id) ON DELETE SET NULL,
  status public.appeal_status NOT NULL DEFAULT 'pending',
  body text NOT NULL,
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.account_appeals TO authenticated;
GRANT ALL ON public.account_appeals TO service_role;
ALTER TABLE public.account_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_appeals_select_own" ON public.account_appeals FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.has_permission(auth.uid(), 'appeals.view'));
CREATE POLICY "account_appeals_insert_own" ON public.account_appeals FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());
CREATE UNIQUE INDEX account_appeals_one_pending_idx ON public.account_appeals (profile_id)
  WHERE status IN ('pending','reviewing');
CREATE TRIGGER account_appeals_set_updated_at BEFORE UPDATE ON public.account_appeals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only restricted/suspended/banned members may appeal; staff-only fields are scrubbed.
CREATE OR REPLACE FUNCTION public.guard_appeal_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.profile_id := auth.uid();
    NEW.status := 'pending';
    NEW.decision_note := NULL;
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    IF public.effective_account_status(auth.uid()) NOT IN ('restricted','suspended','banned') THEN
      RAISE EXCEPTION 'FORBIDDEN: only a restricted, suspended or banned account can appeal'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.body := btrim(NEW.body);
  IF length(NEW.body) < 10 OR length(NEW.body) > 2000 THEN
    RAISE EXCEPTION 'INVALID_APPEAL: an appeal must be between 10 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_appeals_guard_insert BEFORE INSERT ON public.account_appeals
  FOR EACH ROW EXECUTE FUNCTION public.guard_appeal_insert();

-- ============ ENFORCEMENT ============
-- Likes, passes and blocks require an account in good standing.
CREATE OR REPLACE FUNCTION public.guard_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid;
  target uuid;
  target_deleted timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    actor := NEW.liker_id; target := NEW.likee_id;
  ELSIF TG_TABLE_NAME = 'passes' THEN
    actor := NEW.passer_id; target := NEW.passed_id;
  ELSE
    actor := NEW.blocker_id; target := NEW.blocked_id;
  END IF;

  SELECT p.deleted_at INTO target_deleted FROM public.profiles p WHERE p.id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_TARGET: profile does not exist' USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = actor AND NOT public.account_can_act(actor) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: this account cannot perform that action'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME <> 'blocks' THEN
    IF target_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_TARGET: profile is no longer available' USING ERRCODE = 'check_violation';
    END IF;
    IF public.effective_account_status(target) IN ('suspended','banned','deleted') THEN
      RAISE EXCEPTION 'INVALID_TARGET: profile is no longer available' USING ERRCODE = 'check_violation';
    END IF;
    IF public.is_blocked_pair(actor, target) THEN
      RAISE EXCEPTION 'BLOCKED: interaction is not allowed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Messaging requires both sides to be in good standing.
CREATE OR REPLACE FUNCTION public.can_send_message(p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.matches m ON m.id = c.match_id
    JOIN public.profiles pa ON pa.id = c.profile_a
    JOIN public.profiles pb ON pb.id = c.profile_b
    WHERE c.id = p_conversation
      AND auth.uid() IN (c.profile_a, c.profile_b)
      AND m.status = 'active'
      AND pa.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND public.effective_account_status(c.profile_a) = 'active'
      AND public.effective_account_status(c.profile_b) = 'active'
      AND NOT public.is_blocked_pair(c.profile_a, c.profile_b)
  );
$$;

-- Discovery hides anyone who is not in good standing.
CREATE OR REPLACE FUNCTION public.discover_candidates(p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, first_name text, age integer, city text, country text, distance_km integer, relationship_intent relationship_intent, bio text, interest_slugs text[], photo_paths text[], smoking smoking_habit, drinking drinking_habit, exercise exercise_habit, children children_plan, social_energy social_energy, communication_style communication_style, they_want_my_age boolean, they_want_my_gender boolean, they_want_my_intent boolean, completeness numeric, last_active_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  viewer uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  off integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public.effective_account_status(viewer) <> 'active' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT p.id, p.gender, p.date_of_birth, p.relationship_intent,
           p.approx_latitude AS lat, p.approx_longitude AS lng,
           pr.min_age, pr.max_age, pr.preferred_genders, pr.intents, pr.max_distance_km
    FROM public.profiles p
    JOIN public.preferences pr ON pr.profile_id = p.id
    WHERE p.id = viewer AND p.deleted_at IS NULL
  )
  SELECT
    c.id,
    c.first_name,
    date_part('year', age(c.date_of_birth))::int,
    c.city,
    c.country,
    public.approx_distance_km(me.lat, me.lng, c.approx_latitude, c.approx_longitude),
    c.relationship_intent,
    c.bio,
    coalesce((SELECT array_agg(i.slug ORDER BY i.sort_order)
              FROM public.profile_interests pi JOIN public.interests i ON i.id = pi.interest_id
              WHERE pi.profile_id = c.id), '{}'::text[]),
    coalesce((SELECT array_agg(ph.storage_path ORDER BY ph.is_primary DESC, ph.display_order)
              FROM public.profile_photos ph WHERE ph.profile_id = c.id), '{}'::text[]),
    c.smoking, c.drinking, c.exercise, c.children, c.social_energy, c.communication_style,
    (date_part('year', age(me.date_of_birth))::int BETWEEN cp.min_age AND cp.max_age),
    (array_length(cp.preferred_genders, 1) IS NULL OR me.gender = ANY (cp.preferred_genders)),
    (array_length(cp.intents, 1) IS NULL OR me.relationship_intent = ANY (cp.intents)),
    public.profile_completeness(c.id),
    c.last_active_at
  FROM me
  JOIN public.profiles c ON c.id <> me.id
  JOIN public.preferences cp ON cp.profile_id = c.id
  JOIN public.privacy_settings cs ON cs.profile_id = c.id
  WHERE c.deleted_at IS NULL
    AND c.date_of_birth IS NOT NULL
    AND c.date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')
    AND public.effective_account_status(c.id) = 'active'
    AND cs.discoverable IS TRUE
    AND cs.profile_visibility = 'everyone'
    AND NOT public.is_blocked_pair(me.id, c.id)
    AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = me.id AND l.likee_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = me.id AND ps.passed_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.matches m
                    WHERE m.profile_a = least(me.id, c.id) AND m.profile_b = greatest(me.id, c.id))
    AND date_part('year', age(c.date_of_birth))::int BETWEEN me.min_age AND me.max_age
    AND (array_length(me.preferred_genders, 1) IS NULL OR c.gender = ANY (me.preferred_genders))
    AND (array_length(me.intents, 1) IS NULL OR c.relationship_intent IS NULL OR c.relationship_intent = ANY (me.intents))
    AND (me.date_of_birth IS NULL OR date_part('year', age(me.date_of_birth))::int BETWEEN cp.min_age AND cp.max_age)
    AND (array_length(cp.preferred_genders, 1) IS NULL OR me.gender IS NULL OR me.gender = ANY (cp.preferred_genders))
    AND (
      public.approx_distance_km(me.lat, me.lng, c.approx_latitude, c.approx_longitude) IS NULL
      OR public.approx_distance_km(me.lat, me.lng, c.approx_latitude, c.approx_longitude)
         <= least(me.max_distance_km, cp.max_distance_km)
    )
  ORDER BY
    (c.relationship_intent = me.relationship_intent) DESC,
    public.profile_completeness(c.id) DESC,
    c.last_active_at DESC,
    c.id
  LIMIT lim OFFSET off;
END;
$function$;

-- ============ AUTOMATIC CASE INTAKE ============
CREATE OR REPLACE FUNCTION public.category_priority(_category public.report_category)
RETURNS public.moderation_priority LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _category
    WHEN 'underage_concern' THEN 'critical'
    WHEN 'threat' THEN 'critical'
    WHEN 'sexual_content' THEN 'high'
    WHEN 'financial_solicitation' THEN 'high'
    WHEN 'scam' THEN 'high'
    WHEN 'harassment' THEN 'high'
    WHEN 'hate' THEN 'high'
    WHEN 'impersonation' THEN 'medium'
    WHEN 'fake_profile' THEN 'medium'
    ELSE 'low'
  END::public.moderation_priority;
$$;

CREATE OR REPLACE FUNCTION public.open_case_for_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  new_priority public.moderation_priority := public.category_priority(NEW.category);
BEGIN
  SELECT id INTO existing FROM public.moderation_cases
  WHERE subject_id = NEW.reported_id AND status IN ('open','investigating','action_required')
  LIMIT 1;

  IF existing IS NULL THEN
    INSERT INTO public.moderation_cases (subject_id, source, category, priority,
      report_id, message_report_id)
    VALUES (
      NEW.reported_id,
      CASE WHEN TG_TABLE_NAME = 'reports' THEN 'profile_report' ELSE 'message_report' END,
      NEW.category,
      new_priority,
      CASE WHEN TG_TABLE_NAME = 'reports' THEN NEW.id ELSE NULL END,
      CASE WHEN TG_TABLE_NAME = 'message_reports' THEN NEW.id ELSE NULL END
    );
  ELSE
    UPDATE public.moderation_cases
    SET report_count = report_count + 1,
        priority = CASE WHEN new_priority > priority THEN new_priority ELSE priority END,
        updated_at = now()
    WHERE id = existing;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER reports_open_case AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.open_case_for_report();
CREATE TRIGGER message_reports_open_case AFTER INSERT ON public.message_reports
  FOR EACH ROW EXECUTE FUNCTION public.open_case_for_report();