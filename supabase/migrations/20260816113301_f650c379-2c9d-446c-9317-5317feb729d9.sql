
-- 1. Ticket status workflow
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open','pending_user','resolved','closed'));

-- 2. Replies table
CREATE TABLE public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_replies_ticket_idx
  ON public.support_ticket_replies (ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_replies TO authenticated;
GRANT ALL ON public.support_ticket_replies TO service_role;

ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_replies_select
  ON public.support_ticket_replies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.profile_id = auth.uid()
    )
    OR public.has_permission(auth.uid(), 'support.tickets.view')
  );

CREATE POLICY support_ticket_replies_insert_own
  ON public.support_ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_staff = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.profile_id = auth.uid()
        AND t.status <> 'closed'
    )
  );

-- 3. Member replies reopen the ticket
CREATE OR REPLACE FUNCTION public.support_reply_touch_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_staff THEN
    UPDATE public.support_tickets
      SET status = CASE WHEN status IN ('open','pending_user') THEN 'pending_user' ELSE status END,
          updated_at = now()
      WHERE id = NEW.ticket_id;
  ELSE
    UPDATE public.support_tickets
      SET status = CASE WHEN status IN ('pending_user','resolved') THEN 'open' ELSE status END,
          updated_at = now()
      WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.support_reply_touch_ticket() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER support_ticket_replies_touch
AFTER INSERT ON public.support_ticket_replies
FOR EACH ROW EXECUTE FUNCTION public.support_reply_touch_ticket();

-- 4. Permissions
INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','support.tickets.view'),
  ('super_admin','support.tickets.reply'),
  ('super_admin','support.tickets.close'),
  ('moderator','support.tickets.view'),
  ('support','support.tickets.view'),
  ('support','support.tickets.reply'),
  ('support','support.tickets.close')
ON CONFLICT DO NOTHING;

-- 5. Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_list_support_tickets(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  profile_id uuid,
  first_name text,
  category text,
  subject text,
  body text,
  status text,
  reply_count integer,
  last_reply_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_permission('support.tickets.view');
  RETURN QUERY
  SELECT t.id,
         t.profile_id,
         p.first_name,
         t.category,
         t.subject,
         t.body,
         t.status,
         COALESCE(r.cnt, 0)::integer,
         r.last_at,
         t.created_at,
         t.updated_at
  FROM public.support_tickets t
  LEFT JOIN public.profiles p ON p.id = t.profile_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS cnt, max(created_at) AS last_at
    FROM public.support_ticket_replies sr WHERE sr.ticket_id = t.id
  ) r ON true
  WHERE (p_status IS NULL OR t.status = p_status)
  ORDER BY t.updated_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_support_ticket_replies(p_ticket uuid)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  author_name text,
  is_staff boolean,
  body text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_permission('support.tickets.view');
  RETURN QUERY
  SELECT r.id, r.author_id, p.first_name, r.is_staff, r.body, r.created_at
  FROM public.support_ticket_replies r
  LEFT JOIN public.profiles p ON p.id = r.author_id
  WHERE r.ticket_id = p_ticket
  ORDER BY r.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reply_support_ticket(
  p_ticket uuid,
  p_body text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_body text := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF v_body IS NOT NULL THEN
    PERFORM private.require_permission('support.tickets.reply');
  END IF;

  IF p_status IS NOT NULL THEN
    IF p_status NOT IN ('open','pending_user','resolved','closed') THEN
      RAISE EXCEPTION 'INVALID_STATUS';
    END IF;
    IF p_status IN ('resolved','closed') THEN
      PERFORM private.require_permission('support.tickets.close');
    ELSE
      PERFORM private.require_permission('support.tickets.reply');
    END IF;
  END IF;

  IF v_body IS NULL AND p_status IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_DO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = p_ticket) THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  END IF;

  IF v_body IS NOT NULL THEN
    INSERT INTO public.support_ticket_replies (ticket_id, author_id, is_staff, body)
    VALUES (p_ticket, v_actor, true, left(v_body, 4000));
  END IF;

  IF p_status IS NOT NULL THEN
    UPDATE public.support_tickets
      SET status = p_status, updated_at = now()
      WHERE id = p_ticket;
  END IF;

  PERFORM public.write_audit(
    v_actor,
    'support.ticket.reply',
    'support_ticket',
    p_ticket,
    NULL,
    NULL,
    jsonb_build_object('replied', v_body IS NOT NULL, 'status', p_status)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_support_tickets(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_support_ticket_replies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reply_support_ticket(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_support_tickets(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_replies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reply_support_ticket(uuid, text, text) TO authenticated;
