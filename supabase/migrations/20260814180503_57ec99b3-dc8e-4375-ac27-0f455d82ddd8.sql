-- 1. Storage hardening: only image file types may be written to the photo bucket.
DROP POLICY IF EXISTS profile_photos_storage_insert_own ON storage.objects;
CREATE POLICY profile_photos_storage_insert_own
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
);

DROP POLICY IF EXISTS profile_photos_storage_update_own ON storage.objects;
CREATE POLICY profile_photos_storage_update_own
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
);

-- 2. Deletion requests: owners may only cancel; all other fields are immutable.
CREATE OR REPLACE FUNCTION public.guard_deletion_request_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> OLD.profile_id THEN
    RETURN NEW; -- privileged/back-office paths are not restricted here
  END IF;

  NEW.profile_id := OLD.profile_id;
  NEW.requested_at := OLD.requested_at;
  NEW.scheduled_purge_at := OLD.scheduled_purge_at;
  NEW.created_at := OLD.created_at;

  IF NEW.status <> OLD.status AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
    RAISE EXCEPTION 'FORBIDDEN: a deletion request can only be cancelled by its owner'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    NEW.processed_at := now();
  ELSE
    NEW.processed_at := OLD.processed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_deletion_requests_guard_update ON public.account_deletion_requests;
CREATE TRIGGER account_deletion_requests_guard_update
BEFORE UPDATE ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_deletion_request_update();

-- Only one open deletion request per account.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending_idx
ON public.account_deletion_requests (profile_id)
WHERE status = 'pending';

-- 3. Age gate: onboarding cannot be completed without a verified adult date of birth.
CREATE OR REPLACE FUNCTION public.enforce_dob_before_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dob date;
BEGIN
  IF NEW.is_complete THEN
    SELECT p.date_of_birth INTO dob FROM public.profiles p WHERE p.id = NEW.profile_id;
    IF dob IS NULL THEN
      RAISE EXCEPTION 'UNDERAGE: a verified date of birth is required before onboarding can be completed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF dob > (CURRENT_DATE - INTERVAL '18 years') THEN
      RAISE EXCEPTION 'UNDERAGE: LYVE is an 18+ platform'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_progress_enforce_dob ON public.onboarding_progress;
CREATE TRIGGER onboarding_progress_enforce_dob
BEFORE INSERT OR UPDATE ON public.onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.enforce_dob_before_completion();