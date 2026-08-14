CREATE OR REPLACE FUNCTION public.open_case_for_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (CASE WHEN TG_TABLE_NAME = 'reports' THEN 'profile_report' ELSE 'message_report' END)::public.moderation_source,
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_decide_appeal(p_appeal uuid, p_status appeal_status, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- A granted appeal is a reversal: the account returns to good standing and
  -- the restoration is recorded separately from the appeal decision.
  IF p_status = 'granted' THEN
    UPDATE public.profiles
    SET account_status = 'active',
        suspended_until = NULL,
        status_reason = NULL,
        status_changed_at = now(),
        status_changed_by = actor
    WHERE id = subject AND deleted_at IS NULL;

    UPDATE public.moderation_cases
    SET status = 'dismissed', resolved_at = now(), updated_at = now()
    WHERE subject_id = subject AND status IN ('open','investigating','action_required');

    PERFORM public.write_audit(actor, 'ACCOUNT_RESTORED', 'profile', subject, NULL,
      'Appeal granted', jsonb_build_object('appeal_id', p_appeal));
  END IF;

  PERFORM public.write_audit(actor, 'APPEAL_DECIDED', 'account_appeal', p_appeal, NULL, p_note,
    jsonb_build_object('status', p_status, 'profile_id', subject));
  RETURN true;
END;
$function$;