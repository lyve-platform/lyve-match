-- Least privilege: no signed-out (anon) table privileges anywhere in public.
-- No table has an anon policy, so this removes latent privilege only.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profile_photos FROM anon;
REVOKE ALL ON public.profile_interests FROM anon;
REVOKE ALL ON public.preferences FROM anon;
REVOKE ALL ON public.privacy_settings FROM anon;
REVOKE ALL ON public.onboarding_progress FROM anon;
REVOKE ALL ON public.account_deletion_requests FROM anon;
REVOKE ALL ON public.interests FROM anon;
REVOKE ALL ON public.likes FROM anon;
REVOKE ALL ON public.passes FROM anon;
REVOKE ALL ON public.matches FROM anon;
REVOKE ALL ON public.blocks FROM anon;
REVOKE ALL ON public.reports FROM anon;

-- Clients may never write matches directly; only the definer trigger does.
REVOKE INSERT, DELETE, TRUNCATE ON public.matches FROM authenticated;
-- Reports are append-only for their author.
REVOKE UPDATE, DELETE, TRUNCATE ON public.reports FROM authenticated;

-- Supporting indexes
CREATE INDEX IF NOT EXISTS reports_reporter_idx ON public.reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_last_active_idx ON public.profiles (last_active_at DESC) WHERE deleted_at IS NULL;