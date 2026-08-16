DO $$
DECLARE
  r record;
  d text;
  fn text;
  names text[] := ARRAY['account_can_act','effective_account_status','is_blocked_pair','is_conversation_member','can_read_conversation','can_send_message','has_role','is_staff','require_permission'];
BEGIN
  FOR r IN
    SELECT p.oid AS oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND p.prokind IN ('f','p')
      AND pg_get_functiondef(p.oid) ~ 'public\.(account_can_act|effective_account_status|is_blocked_pair|is_conversation_member|can_read_conversation|can_send_message|has_role|is_staff|require_permission)\s*\('
  LOOP
    d := pg_get_functiondef(r.oid);
    FOREACH fn IN ARRAY names LOOP
      d := regexp_replace(d, 'public\.' || fn || '\s*\(', 'private.' || fn || '(', 'g');
    END LOOP;
    EXECUTE d;
  END LOOP;
END $$;