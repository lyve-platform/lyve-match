-- Supabase default privileges hand EXECUTE to anon/authenticated on new functions;
-- REVOKE ... FROM PUBLIC does not remove those explicit grants.
REVOKE ALL ON FUNCTION public.write_audit(uuid, text, text, uuid, uuid, text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_accounts(boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_safety_signal() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.open_case_for_report() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_status() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_appeal_insert() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_audit_mutation() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.require_permission(text) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_can_act(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.effective_account_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_metrics() FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(public.account_status, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_cases(public.moderation_case_status, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_case_reports(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_case_signals(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_update_case(uuid, public.moderation_case_status, public.moderation_priority, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_moderate_account(uuid, text, text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_audit(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_appeals(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_decide_appeal(uuid, public.appeal_status, text) FROM anon;
REVOKE ALL ON FUNCTION public.category_priority(public.report_category) FROM anon;

-- Anonymous callers must never read the new admin/safety tables either.
REVOKE ALL ON public.user_roles, public.role_permissions, public.moderation_cases,
  public.safety_signals, public.admin_audit_logs, public.account_appeals FROM anon;