-- ============================================================ enums
CREATE TYPE public.smoking_habit AS ENUM ('never','socially','regularly','prefer_not_to_say');
CREATE TYPE public.drinking_habit AS ENUM ('never','socially','regularly','prefer_not_to_say');
CREATE TYPE public.exercise_habit AS ENUM ('rarely','sometimes','often','prefer_not_to_say');
CREATE TYPE public.children_plan AS ENUM ('want_children','do_not_want_children','open_to_children','have_children','prefer_not_to_say');
CREATE TYPE public.social_energy AS ENUM ('introvert','ambivert','extrovert','prefer_not_to_say');
CREATE TYPE public.communication_style AS ENUM ('thoughtful','direct','playful','reserved','prefer_not_to_say');
CREATE TYPE public.match_status AS ENUM ('active','unmatched','blocked');
CREATE TYPE public.report_category AS ENUM (
  'fake_profile','scam','harassment','hate','sexual_content','threat','spam',
  'underage_concern','impersonation','financial_solicitation','other');
CREATE TYPE public.report_status AS ENUM ('open','reviewing','actioned','dismissed');

-- ============================================================ profile additions
ALTER TABLE public.profiles
  ADD COLUMN smoking public.smoking_habit,
  ADD COLUMN drinking public.drinking_habit,
  ADD COLUMN exercise public.exercise_habit,
  ADD COLUMN children public.children_plan,
  ADD COLUMN social_energy public.social_energy,
  ADD COLUMN communication_style public.communication_style,
  -- Approximate, coarse location. Never returned to another member: discovery
  -- exposes a rounded distance bucket only.
  ADD COLUMN approx_latitude numeric(8,5),
  ADD COLUMN approx_longitude numeric(8,5),
  ADD COLUMN last_active_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_latitude_range CHECK (approx_latitude IS NULL OR approx_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT profiles_longitude_range CHECK (approx_longitude IS NULL OR approx_longitude BETWEEN -180 AND 180);

CREATE INDEX profiles_discovery_idx ON public.profiles (deleted_at, gender, relationship_intent);

-- ============================================================ helper functions
CREATE OR REPLACE FUNCTION public.approx_distance_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE round(
      6371 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    )::int
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_completeness(p_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT round((
      (CASE WHEN p.first_name IS NOT NULL AND p.date_of_birth IS NOT NULL AND p.gender IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN p.country IS NOT NULL AND p.city IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN p.relationship_intent IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN length(coalesce(p.bio,'')) >= 20 THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM public.profile_photos ph WHERE ph.profile_id = p.id) THEN 1 ELSE 0 END)
    + (CASE WHEN (SELECT count(*) FROM public.profile_interests pi WHERE pi.profile_id = p.id) >= 3 THEN 1 ELSE 0 END)
    + (CASE WHEN p.smoking IS NOT NULL OR p.drinking IS NOT NULL OR p.exercise IS NOT NULL OR p.children IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN p.social_energy IS NOT NULL OR p.communication_style IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM public.preferences pr WHERE pr.profile_id = p.id
                          AND array_length(pr.preferred_genders,1) > 0 AND array_length(pr.intents,1) > 0) THEN 1 ELSE 0 END)
  )::numeric / 9, 3)
  FROM public.profiles p WHERE p.id = p_id;
$$;

-- ============================================================ blocks
CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT blocks_unique_pair UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX blocks_blocked_idx ON public.blocks (blocked_id);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_select_own ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY blocks_insert_own ON public.blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY blocks_delete_own ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

-- ============================================================ likes
CREATE TABLE public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  likee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT likes_no_self CHECK (liker_id <> likee_id),
  CONSTRAINT likes_unique_pair UNIQUE (liker_id, likee_id)
);
CREATE INDEX likes_likee_idx ON public.likes (likee_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY likes_select_involved ON public.likes FOR SELECT TO authenticated
  USING (auth.uid() = liker_id OR auth.uid() = likee_id);
CREATE POLICY likes_insert_own ON public.likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = liker_id);
CREATE POLICY likes_delete_own ON public.likes FOR DELETE TO authenticated USING (auth.uid() = liker_id);

-- ============================================================ passes
CREATE TABLE public.passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  passed_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT passes_no_self CHECK (passer_id <> passed_id),
  CONSTRAINT passes_unique_pair UNIQUE (passer_id, passed_id)
);
CREATE INDEX passes_passer_idx ON public.passes (passer_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.passes TO authenticated;
GRANT ALL ON public.passes TO service_role;
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY passes_select_own ON public.passes FOR SELECT TO authenticated USING (auth.uid() = passer_id);
CREATE POLICY passes_insert_own ON public.passes FOR INSERT TO authenticated WITH CHECK (auth.uid() = passer_id);
CREATE POLICY passes_delete_own ON public.passes FOR DELETE TO authenticated USING (auth.uid() = passer_id);

-- ============================================================ matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.match_status NOT NULL DEFAULT 'active',
  ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_ordered_pair CHECK (profile_a < profile_b),
  CONSTRAINT matches_unique_pair UNIQUE (profile_a, profile_b)
);
CREATE INDEX matches_participant_a_idx ON public.matches (profile_a, status);
CREATE INDEX matches_participant_b_idx ON public.matches (profile_b, status);
GRANT SELECT, UPDATE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matches_select_participant ON public.matches FOR SELECT TO authenticated
  USING (auth.uid() = profile_a OR auth.uid() = profile_b);
-- Participants may only unmatch; the guard trigger freezes every other column.
CREATE POLICY matches_update_participant ON public.matches FOR UPDATE TO authenticated
  USING (auth.uid() = profile_a OR auth.uid() = profile_b)
  WITH CHECK (auth.uid() = profile_a OR auth.uid() = profile_b);

CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================ reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category public.report_category NOT NULL,
  description text,
  status public.report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_no_self CHECK (reporter_id <> reported_id),
  CONSTRAINT reports_description_length CHECK (description IS NULL OR length(description) <= 2000)
);
CREATE INDEX reports_reported_idx ON public.reports (reported_id, created_at DESC);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_select_own ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY reports_insert_own ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND status = 'open');

CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================ interaction integrity
CREATE OR REPLACE FUNCTION public.guard_interaction()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  IF TG_TABLE_NAME <> 'blocks' THEN
    IF target_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_TARGET: profile is no longer available' USING ERRCODE = 'check_violation';
    END IF;
    IF public.is_blocked_pair(actor, target) THEN
      RAISE EXCEPTION 'BLOCKED: interaction is not allowed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER likes_guard BEFORE INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.guard_interaction();
CREATE TRIGGER passes_guard BEFORE INSERT ON public.passes
FOR EACH ROW EXECUTE FUNCTION public.guard_interaction();
CREATE TRIGGER blocks_guard BEFORE INSERT ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.guard_interaction();

-- Mutual like -> exactly one match row, created by the database only.
CREATE OR REPLACE FUNCTION public.create_match_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = NEW.likee_id AND l.likee_id = NEW.liker_id) THEN
    INSERT INTO public.matches (profile_a, profile_b)
    VALUES (least(NEW.liker_id, NEW.likee_id), greatest(NEW.liker_id, NEW.likee_id))
    ON CONFLICT (profile_a, profile_b) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER likes_create_match AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_match_on_mutual_like();

-- Unmatch: participants may only end an active match; the pair is then parked
-- as a mutual pass so neither reappears in the other's discovery feed.
CREATE OR REPLACE FUNCTION public.guard_match_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (OLD.profile_a, OLD.profile_b) THEN
    RETURN NEW; -- privileged/back-office path
  END IF;

  NEW.id := OLD.id;
  NEW.profile_a := OLD.profile_a;
  NEW.profile_b := OLD.profile_b;
  NEW.created_at := OLD.created_at;

  IF NEW.status = OLD.status THEN
    RETURN OLD;
  END IF;

  IF NOT (OLD.status = 'active' AND NEW.status = 'unmatched') THEN
    RAISE EXCEPTION 'FORBIDDEN: a match can only be ended by a participant'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.ended_by := auth.uid();
  NEW.ended_at := now();

  DELETE FROM public.likes
  WHERE (liker_id = OLD.profile_a AND likee_id = OLD.profile_b)
     OR (liker_id = OLD.profile_b AND likee_id = OLD.profile_a);

  INSERT INTO public.passes (passer_id, passed_id)
  VALUES (OLD.profile_a, OLD.profile_b), (OLD.profile_b, OLD.profile_a)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER matches_guard_update BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.guard_match_update();

-- Blocking severs everything between the pair, immediately.
CREATE OR REPLACE FUNCTION public.apply_block_effects()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.likes
  WHERE (liker_id = NEW.blocker_id AND likee_id = NEW.blocked_id)
     OR (liker_id = NEW.blocked_id AND likee_id = NEW.blocker_id);

  UPDATE public.matches
  SET status = 'blocked', ended_by = NEW.blocker_id, ended_at = now()
  WHERE profile_a = least(NEW.blocker_id, NEW.blocked_id)
    AND profile_b = greatest(NEW.blocker_id, NEW.blocked_id)
    AND status <> 'blocked';

  RETURN NULL;
END;
$$;

CREATE TRIGGER blocks_apply_effects AFTER INSERT ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.apply_block_effects();

-- ============================================================ discovery
CREATE OR REPLACE FUNCTION public.discover_candidates(p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
RETURNS TABLE (
  profile_id uuid,
  first_name text,
  age integer,
  city text,
  country text,
  distance_km integer,
  relationship_intent public.relationship_intent,
  bio text,
  interest_slugs text[],
  photo_paths text[],
  smoking public.smoking_habit,
  drinking public.drinking_habit,
  exercise public.exercise_habit,
  children public.children_plan,
  social_energy public.social_energy,
  communication_style public.communication_style,
  they_want_my_age boolean,
  they_want_my_gender boolean,
  they_want_my_intent boolean,
  completeness numeric,
  last_active_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  viewer uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  off integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
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
    AND cs.discoverable IS TRUE
    AND cs.profile_visibility = 'everyone'
    AND NOT public.is_blocked_pair(me.id, c.id)
    AND NOT EXISTS (SELECT 1 FROM public.likes l WHERE l.liker_id = me.id AND l.likee_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.passes ps WHERE ps.passer_id = me.id AND ps.passed_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.matches m
                    WHERE m.profile_a = least(me.id, c.id) AND m.profile_b = greatest(me.id, c.id))
    -- my preferences about them
    AND date_part('year', age(c.date_of_birth))::int BETWEEN me.min_age AND me.max_age
    AND (array_length(me.preferred_genders, 1) IS NULL OR c.gender = ANY (me.preferred_genders))
    AND (array_length(me.intents, 1) IS NULL OR c.relationship_intent IS NULL OR c.relationship_intent = ANY (me.intents))
    -- their preferences about me (mutual eligibility)
    AND (me.date_of_birth IS NULL OR date_part('year', age(me.date_of_birth))::int BETWEEN cp.min_age AND cp.max_age)
    AND (array_length(cp.preferred_genders, 1) IS NULL OR me.gender IS NULL OR me.gender = ANY (cp.preferred_genders))
    -- distance, when both sides shared an approximate location
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
$$;

-- Cards for people who liked me and are still eligible to be shown.
CREATE OR REPLACE FUNCTION public.likes_received()
RETURNS TABLE (
  profile_id uuid, first_name text, age integer, city text, country text,
  relationship_intent public.relationship_intent, bio text,
  interest_slugs text[], photo_paths text[], liked_at timestamptz
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
         l.created_at
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

-- Minimal information about my active matches.
CREATE OR REPLACE FUNCTION public.my_matches()
RETURNS TABLE (
  match_id uuid, profile_id uuid, first_name text, age integer, city text, country text,
  relationship_intent public.relationship_intent, bio text,
  interest_slugs text[], photo_paths text[], matched_at timestamptz
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
         m.created_at
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

REVOKE EXECUTE ON FUNCTION public.discover_candidates(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.likes_received() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_matches() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_completeness(uuid) FROM anon;