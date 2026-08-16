CREATE OR REPLACE FUNCTION public.admin_list_support_tickets(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, profile_id uuid, first_name text, category text, subject text, body text, status text, reply_count integer, last_reply_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT count(*)::integer AS cnt, max(sr.created_at) AS last_at
    FROM public.support_ticket_replies sr WHERE sr.ticket_id = t.id
  ) r ON true
  WHERE (p_status IS NULL OR t.status = p_status)
  ORDER BY t.updated_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
END;
$function$;