-- 1. Trigger-only function must not be directly callable through the API
REVOKE EXECUTE ON FUNCTION public.store_purchase_audit_immutable() FROM PUBLIC, anon, authenticated;

-- 2. Pin search_path on the remaining mutable-path function
ALTER FUNCTION public.guard_billing_event_mutation() SET search_path = public;

-- 3. Restrict the permission matrix to staff who genuinely hold admin console access
DROP POLICY IF EXISTS "role_permissions_select_staff" ON public.role_permissions;
CREATE POLICY "role_permissions_select_staff"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.access'));