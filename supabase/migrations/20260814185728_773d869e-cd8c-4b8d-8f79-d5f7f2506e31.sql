-- Phase 3 least-privilege hardening for messaging tables.
REVOKE ALL ON public.conversations FROM anon, authenticated;
REVOKE ALL ON public.conversation_members FROM anon, authenticated;
REVOKE ALL ON public.messages FROM anon, authenticated;
REVOKE ALL ON public.message_reads FROM anon, authenticated;
REVOKE ALL ON public.message_reports FROM anon, authenticated;

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.message_reads TO authenticated;
GRANT SELECT, INSERT ON public.message_reports TO authenticated;

GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_members TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.message_reads TO service_role;
GRANT ALL ON public.message_reports TO service_role;