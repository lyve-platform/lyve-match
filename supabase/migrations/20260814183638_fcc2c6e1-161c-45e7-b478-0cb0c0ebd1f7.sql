CREATE OR REPLACE FUNCTION public.guard_match_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- A genuine block (row already inserted by the member themselves) may end the
  -- match. Safety controls must never be blocked by the unmatch state machine.
  IF NEW.status = 'blocked' AND public.is_blocked_pair(OLD.profile_a, OLD.profile_b) THEN
    NEW.ended_by := coalesce(NEW.ended_by, auth.uid());
    NEW.ended_at := coalesce(NEW.ended_at, now());
    RETURN NEW;
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
$function$;

-- A block must also end a match that was already unmatched-then-reported, and
-- must survive regardless of the prior status.
CREATE OR REPLACE FUNCTION public.apply_block_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;