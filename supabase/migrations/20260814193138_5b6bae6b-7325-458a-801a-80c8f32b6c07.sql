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

  IF p_status = 'granted' THEN
    UPDATE public.profiles
    SET account_status = 'active',
        suspended_until = NULL,
        status_reason = NULL,
        status_changed_at = now()
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