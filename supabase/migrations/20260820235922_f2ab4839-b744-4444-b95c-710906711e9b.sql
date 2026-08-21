-- ============ VERIFICATION ============
DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('unverified','pending','verified','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_verification_status_idx ON public.profiles (verification_status);

CREATE OR REPLACE FUNCTION public.guard_profile_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    IF coalesce(current_setting('lyve.verification_review', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'VERIFICATION_READ_ONLY' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_verification ON public.profiles;
CREATE TRIGGER guard_profile_verification
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verification();

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  selfie_path text NOT NULL,
  status public.verification_status NOT NULL DEFAULT 'pending',
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_one_pending
  ON public.verification_requests (profile_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS verification_requests_status_idx
  ON public.verification_requests (status, created_at DESC);

GRANT SELECT, INSERT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own verification requests" ON public.verification_requests;
CREATE POLICY "own verification requests" ON public.verification_requests
  FOR SELECT TO authenticated USING (profile_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "submit own verification request" ON public.verification_requests;
CREATE POLICY "submit own verification request" ON public.verification_requests
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid() AND status = 'pending');

INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','verification.review'),
  ('moderator','verification.review')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.request_photo_verification(p_path text)
RETURNS public.verification_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); path text := btrim(coalesce(p_path,''));
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF path = '' OR left(path, length(me::text) + 1) <> (me::text || '/') THEN
    RAISE EXCEPTION 'INVALID_PATH' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = me AND p.verification_status = 'verified') THEN
    RETURN 'verified';
  END IF;

  INSERT INTO public.verification_requests (profile_id, selfie_path)
  VALUES (me, path)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('lyve.verification_review', 'on', true);
  UPDATE public.profiles SET verification_status = 'pending' WHERE id = me;
  PERFORM set_config('lyve.verification_review', 'off', true);
  RETURN 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.my_verification()
RETURNS TABLE(status public.verification_status, submitted_at timestamptz, note text, verified_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT p.verification_status,
         (SELECT max(v.created_at) FROM public.verification_requests v WHERE v.profile_id = me),
         (SELECT v.note FROM public.verification_requests v WHERE v.profile_id = me
          ORDER BY v.created_at DESC LIMIT 1),
         p.verified_at
  FROM public.profiles p WHERE p.id = me;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_verification_requests(
  p_status public.verification_status DEFAULT 'pending', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(request_id uuid, profile_id uuid, nickname text, selfie_path text,
  status public.verification_status, created_at timestamptz, reviewed_at timestamptz, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer := least(greatest(coalesce(p_limit,50),1),100);
        off integer := greatest(coalesce(p_offset,0),0);
BEGIN
  PERFORM private.require_permission('verification.review');
  RETURN QUERY
  SELECT v.id, v.profile_id, p.first_name, v.selfie_path, v.status, v.created_at, v.reviewed_at, v.note
  FROM public.verification_requests v
  JOIN public.profiles p ON p.id = v.profile_id
  WHERE (p_status IS NULL OR v.status = p_status)
  ORDER BY v.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_verification(
  p_request uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS public.verification_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; subject uuid; result public.verification_status;
BEGIN
  actor := private.require_permission('verification.review');
  SELECT v.profile_id INTO subject FROM public.verification_requests v WHERE v.id = p_request;
  IF subject IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  result := CASE WHEN p_approve THEN 'verified'::public.verification_status
                 ELSE 'rejected'::public.verification_status END;

  UPDATE public.verification_requests
  SET status = result, note = nullif(btrim(coalesce(p_note,'')),''),
      reviewed_by = actor, reviewed_at = now()
  WHERE id = p_request;

  PERFORM set_config('lyve.verification_review', 'on', true);
  UPDATE public.profiles
  SET verification_status = result,
      verified_at = CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE id = subject;
  PERFORM set_config('lyve.verification_review', 'off', true);

  PERFORM public.write_audit(actor,
    CASE WHEN p_approve THEN 'VERIFICATION_APPROVED' ELSE 'VERIFICATION_REJECTED' END,
    'verification_request', p_request, NULL::uuid, p_note, jsonb_build_object('subject', subject));
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_photo_verification(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_verification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_verification_requests(public.verification_status, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_photo_verification(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_verification() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_verification_requests(public.verification_status, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) TO authenticated, service_role;

-- ============ EXPOSE VERIFIED FLAG TO CANDIDATE FEEDS ============
DROP FUNCTION IF EXISTS public.discover_candidates(integer, integer);
CREATE FUNCTION public.discover_candidates(p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, first_name text, age integer, city text, country text, distance_km integer,
  relationship_intent relationship_intent, bio text, interest_slugs text[], photo_paths text[],
  smoking smoking_habit, drinking drinking_habit, exercise exercise_habit, children children_plan,
  social_energy social_energy, communication_style communication_style, they_want_my_age boolean,
  they_want_my_gender boolean, they_want_my_intent boolean, completeness numeric,
  last_active_at timestamp with time zone, is_verified boolean)
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

  IF private.effective_account_status(viewer) <> 'active' THEN
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
    c.last_active_at,
    (c.verification_status = 'verified')
  FROM me
  JOIN public.profiles c ON c.id <> me.id
  JOIN public.preferences cp ON cp.profile_id = c.id
  JOIN public.privacy_settings cs ON cs.profile_id = c.id
  WHERE c.deleted_at IS NULL
    AND c.date_of_birth IS NOT NULL
    AND c.date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')
    AND private.effective_account_status(c.id) = 'active'
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

DROP FUNCTION IF EXISTS public.likes_received();
CREATE FUNCTION public.likes_received()
RETURNS TABLE (
  profile_id uuid, first_name text, age integer, city text, country text,
  relationship_intent public.relationship_intent, bio text,
  interest_slugs text[], photo_paths text[], liked_at timestamptz, is_verified boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT c.id, c.first_name, date_part('year', age(c.date_of_birth))::int, c.city, c.country,
         c.relationship_intent, c.bio,
         coalesce((SELECT array_agg(i.slug ORDER BY i.sort_order)
                   FROM public.profile_interests pi JOIN public.interests i ON i.id = pi.interest_id
                   WHERE pi.profile_id = c.id), '{}'::text[]),
         coalesce((SELECT array_agg(ph.storage_path ORDER BY ph.is_primary DESC, ph.display_order)
                   FROM public.profile_photos ph WHERE ph.profile_id = c.id), '{}'::text[]),
         l.created_at,
         (c.verification_status = 'verified')
  FROM public.likes l
  JOIN public.profiles c ON c.id = l.liker_id
  WHERE l.likee_id = viewer
    AND c.deleted_at IS NULL
    AND NOT public.is_blocked_pair(viewer, c.id)
    AND NOT EXISTS (SELECT 1 FROM public.likes m WHERE m.liker_id = viewer AND m.likee_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = viewer AND ps.passed_id = c.id)
  ORDER BY l.created_at DESC
  LIMIT 100;
END;
$$;

DROP FUNCTION IF EXISTS public.my_matches();
CREATE FUNCTION public.my_matches()
RETURNS TABLE (
  match_id uuid, profile_id uuid, first_name text, age integer, city text, country text,
  relationship_intent public.relationship_intent, bio text,
  interest_slugs text[], photo_paths text[], matched_at timestamptz, is_verified boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT m.id, c.id, c.first_name, date_part('year', age(c.date_of_birth))::int, c.city, c.country,
         c.relationship_intent, c.bio,
         coalesce((SELECT array_agg(i.slug ORDER BY i.sort_order)
                   FROM public.profile_interests pi JOIN public.interests i ON i.id = pi.interest_id
                   WHERE pi.profile_id = c.id), '{}'::text[]),
         coalesce((SELECT array_agg(ph.storage_path ORDER BY ph.is_primary DESC, ph.display_order)
                   FROM public.profile_photos ph WHERE ph.profile_id = c.id), '{}'::text[]),
         m.created_at,
         (c.verification_status = 'verified')
  FROM public.matches m
  JOIN public.profiles c ON c.id = CASE WHEN m.profile_a = viewer THEN m.profile_b ELSE m.profile_a END
  WHERE (m.profile_a = viewer OR m.profile_b = viewer)
    AND m.status = 'active'
    AND c.deleted_at IS NULL
    AND NOT public.is_blocked_pair(viewer, c.id)
  ORDER BY m.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.discover_candidates(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.likes_received() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_candidates(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.likes_received() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_matches() TO authenticated, service_role;