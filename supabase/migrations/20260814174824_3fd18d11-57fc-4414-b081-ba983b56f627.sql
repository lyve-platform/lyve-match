-- ==========================================================================
-- LYVE Phase 1 — foundation schema
-- ==========================================================================

-- 1. Enums --------------------------------------------------------------
CREATE TYPE public.gender_type AS ENUM
  ('woman', 'man', 'non_binary', 'other', 'prefer_not_to_say');

CREATE TYPE public.relationship_intent AS ENUM
  ('dating', 'serious_relationship', 'marriage', 'new_connections', 'open_to_possibilities');

CREATE TYPE public.profile_visibility AS ENUM
  ('everyone', 'matches_only', 'hidden');

CREATE TYPE public.message_audience AS ENUM
  ('everyone', 'matches_only', 'no_one');

CREATE TYPE public.deletion_request_status AS ENUM
  ('pending', 'cancelled', 'completed');

-- 2. Shared helpers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. profiles -----------------------------------------------------------
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name    TEXT,
  date_of_birth DATE,
  gender        public.gender_type,
  country       TEXT,
  city          TEXT,
  bio           TEXT,
  occupation    TEXT,
  education     TEXT,
  relationship_intent public.relationship_intent,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT profiles_first_name_length CHECK (first_name IS NULL OR char_length(first_name) BETWEEN 1 AND 60),
  CONSTRAINT profiles_bio_length        CHECK (bio IS NULL OR char_length(bio) <= 1000),
  CONSTRAINT profiles_occupation_length CHECK (occupation IS NULL OR char_length(occupation) <= 120),
  CONSTRAINT profiles_education_length  CHECK (education IS NULL OR char_length(education) <= 120),
  CONSTRAINT profiles_country_length    CHECK (country IS NULL OR char_length(country) <= 80),
  CONSTRAINT profiles_city_length       CHECK (city IS NULL OR char_length(city) <= 80)
);

-- Strict 18+ enforcement in the database (time-dependent, so a trigger, not a CHECK).
CREATE OR REPLACE FUNCTION public.enforce_adult_date_of_birth()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
      RAISE EXCEPTION 'UNDERAGE: LYVE is an 18+ platform'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date_of_birth < (CURRENT_DATE - INTERVAL '120 years') THEN
      RAISE EXCEPTION 'INVALID_DOB: date of birth is not valid'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_enforce_adult
BEFORE INSERT OR UPDATE OF date_of_birth ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_adult_date_of_birth();

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profiles_country_city_idx ON public.profiles (country, city);
CREATE INDEX profiles_deleted_at_idx ON public.profiles (deleted_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- 4. profile_photos -----------------------------------------------------
CREATE TABLE public.profile_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0 AND display_order < 12),
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profile_photos_profile_idx ON public.profile_photos (profile_id, display_order);
CREATE UNIQUE INDEX profile_photos_one_primary_idx
  ON public.profile_photos (profile_id) WHERE is_primary;

CREATE TRIGGER profile_photos_set_updated_at
BEFORE UPDATE ON public.profile_photos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_photos TO authenticated;
GRANT ALL ON public.profile_photos TO service_role;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_photos_select_own" ON public.profile_photos
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "profile_photos_insert_own" ON public.profile_photos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "profile_photos_update_own" ON public.profile_photos
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "profile_photos_delete_own" ON public.profile_photos
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 5. interests (catalogue) + profile_interests --------------------------
CREATE TABLE public.interests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  label_en   TEXT NOT NULL,
  label_ar   TEXT NOT NULL,
  category   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER interests_set_updated_at
BEFORE UPDATE ON public.interests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.interests TO authenticated;
GRANT ALL ON public.interests TO service_role;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interests_select_active" ON public.interests
  FOR SELECT TO authenticated USING (is_active);

INSERT INTO public.interests (slug, label_en, label_ar, category, sort_order) VALUES
  ('travel',      'Travel',      'السفر',        'lifestyle', 10),
  ('music',       'Music',       'الموسيقى',      'culture',   20),
  ('movies',      'Movies',      'الأفلام',       'culture',   30),
  ('fitness',     'Fitness',     'اللياقة البدنية','wellbeing', 40),
  ('food',        'Food',        'الطعام',        'lifestyle', 50),
  ('reading',     'Reading',     'القراءة',       'culture',   60),
  ('gaming',      'Gaming',      'الألعاب',       'culture',   70),
  ('art',         'Art',         'الفن',          'culture',   80),
  ('technology',  'Technology',  'التقنية',       'lifestyle', 90),
  ('nature',      'Nature',      'الطبيعة',       'outdoors', 100),
  ('photography', 'Photography', 'التصوير',       'culture',  110),
  ('sports',      'Sports',      'الرياضة',       'wellbeing',120);

CREATE TABLE public.profile_interests (
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, interest_id)
);

CREATE INDEX profile_interests_interest_idx ON public.profile_interests (interest_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_interests TO authenticated;
GRANT ALL ON public.profile_interests TO service_role;
ALTER TABLE public.profile_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_interests_select_own" ON public.profile_interests
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "profile_interests_insert_own" ON public.profile_interests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "profile_interests_delete_own" ON public.profile_interests
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 6. preferences --------------------------------------------------------
CREATE TABLE public.preferences (
  profile_id        UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  min_age           INTEGER NOT NULL DEFAULT 18 CHECK (min_age >= 18 AND min_age <= 120),
  max_age           INTEGER NOT NULL DEFAULT 45 CHECK (max_age >= 18 AND max_age <= 120),
  preferred_genders public.gender_type[] NOT NULL DEFAULT '{}',
  max_distance_km   INTEGER NOT NULL DEFAULT 100 CHECK (max_distance_km BETWEEN 1 AND 20000),
  intents           public.relationship_intent[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT preferences_age_range CHECK (max_age >= min_age)
);

CREATE TRIGGER preferences_set_updated_at
BEFORE UPDATE ON public.preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferences TO authenticated;
GRANT ALL ON public.preferences TO service_role;
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preferences_select_own" ON public.preferences
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "preferences_insert_own" ON public.preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "preferences_update_own" ON public.preferences
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "preferences_delete_own" ON public.preferences
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 7. privacy_settings ---------------------------------------------------
CREATE TABLE public.privacy_settings (
  profile_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_visibility public.profile_visibility NOT NULL DEFAULT 'everyone',
  show_online_status BOOLEAN NOT NULL DEFAULT true,
  show_read_receipts BOOLEAN NOT NULL DEFAULT true,
  discoverable       BOOLEAN NOT NULL DEFAULT true,
  allow_messages     public.message_audience NOT NULL DEFAULT 'matches_only',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER privacy_settings_set_updated_at
BEFORE UPDATE ON public.privacy_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.privacy_settings TO authenticated;
GRANT ALL ON public.privacy_settings TO service_role;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_settings_select_own" ON public.privacy_settings
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "privacy_settings_insert_own" ON public.privacy_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "privacy_settings_update_own" ON public.privacy_settings
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "privacy_settings_delete_own" ON public.privacy_settings
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 8. onboarding_progress ------------------------------------------------
CREATE TABLE public.onboarding_progress (
  profile_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_step    TEXT NOT NULL DEFAULT 'date_of_birth',
  completed_steps TEXT[] NOT NULL DEFAULT '{}',
  is_complete     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER onboarding_progress_set_updated_at
BEFORE UPDATE ON public.onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_progress TO authenticated;
GRANT ALL ON public.onboarding_progress TO service_role;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_progress_select_own" ON public.onboarding_progress
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "onboarding_progress_insert_own" ON public.onboarding_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "onboarding_progress_update_own" ON public.onboarding_progress
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

-- 9. account_deletion_requests ------------------------------------------
CREATE TABLE public.account_deletion_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason             TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  status             public.deletion_request_status NOT NULL DEFAULT 'pending',
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_purge_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX account_deletion_requests_profile_idx
  ON public.account_deletion_requests (profile_id, status);

CREATE TRIGGER account_deletion_requests_set_updated_at
BEFORE UPDATE ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deletion_requests_select_own" ON public.account_deletion_requests
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);
CREATE POLICY "deletion_requests_insert_own" ON public.account_deletion_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "deletion_requests_cancel_own" ON public.account_deletion_requests
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);