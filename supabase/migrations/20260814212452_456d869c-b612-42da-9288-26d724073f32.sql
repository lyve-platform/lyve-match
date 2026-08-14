revoke execute on function public.store_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.store_raise_alert(text, text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function public.store_ops_no_delete() from public, anon, authenticated;
grant execute on function public.store_rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.store_raise_alert(text, text, text, jsonb, integer, integer) to service_role;