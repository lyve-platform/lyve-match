REVOKE ALL ON FUNCTION public.create_conversation_for_match() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_message_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_message_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_conversation_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_conversation_for_match() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_message_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_message_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_conversation_activity() TO service_role;