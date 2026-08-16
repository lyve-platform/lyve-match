CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
DECLARE
  r record;
  internal text[] := ARRAY['account_can_act','effective_account_status','is_blocked_pair','is_conversation_member','can_read_conversation','can_send_message','has_role','is_staff','require_permission'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(internal)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA private', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='private'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, private', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND pg_get_functiondef(p.oid) ~ '(account_can_act|effective_account_status|is_blocked_pair|is_conversation_member|can_read_conversation|can_send_message|has_role\(|is_staff\(|require_permission)'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, private', r.sig);
  END LOOP;
END $$;