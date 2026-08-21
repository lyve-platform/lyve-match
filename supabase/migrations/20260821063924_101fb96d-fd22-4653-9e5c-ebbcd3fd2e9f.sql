REVOKE ALL ON FUNCTION public.admin_list_verification_requests(verification_status, integer, integer) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid, boolean, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.my_verification() FROM anon, public;
REVOKE ALL ON FUNCTION public.request_photo_verification(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.guard_profile_verification() FROM anon, public;
REVOKE ALL ON FUNCTION public.sync_phone_verification() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_list_verification_requests(verification_status, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_verification() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_photo_verification(text) TO authenticated, service_role;