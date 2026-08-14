-- is_blocked_pair is called from RLS policies, so signed-in members need EXECUTE.
-- Tighten it first so a member can only learn about pairs they are part of.
CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (a, b) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;