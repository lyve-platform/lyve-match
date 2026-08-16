CREATE OR REPLACE FUNCTION public.admin_delete_support_ticket(p_ticket uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_status text;
  v_profile uuid;
BEGIN
  PERFORM private.require_permission('support.tickets.delete');

  SELECT status, profile_id INTO v_status, v_profile
  FROM public.support_tickets WHERE id = p_ticket;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  END IF;

  IF v_status NOT IN ('resolved','closed') THEN
    RAISE EXCEPTION 'TICKET_NOT_RESOLVED';
  END IF;

  PERFORM public.write_audit(
    v_actor,
    'support.ticket.delete',
    'support_ticket',
    p_ticket,
    NULL,
    NULL,
    jsonb_build_object('status', v_status, 'profile_id', v_profile)
  );

  DELETE FROM public.support_tickets WHERE id = p_ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_support_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_support_ticket(uuid) TO authenticated;

INSERT INTO public.role_permissions (role, permission)
VALUES ('super_admin', 'support.tickets.delete')
ON CONFLICT DO NOTHING;