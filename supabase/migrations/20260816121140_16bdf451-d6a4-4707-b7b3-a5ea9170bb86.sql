create or replace function public.nickname_available(_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _nickname is null or length(btrim(_nickname)) = 0 then false
    else not exists (
      select 1
      from public.profiles p
      where p.deleted_at is null
        and p.first_name is not null
        and lower(btrim(p.first_name)) = lower(btrim(_nickname))
        and (auth.uid() is null or p.id <> auth.uid())
    )
  end
$$;

revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;