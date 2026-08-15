REVOKE ALL ON FUNCTION public.guard_billing_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_billing_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.guard_billing_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guard_billing_event_mutation() TO service_role;