-- Account deletion support
-- Adds soft-delete flag to profiles and an RPC callable by the authenticated user.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
     set nickname = '탈퇴한 사용자 ' || substr(uid::text, 1, 8),
         avatar_url = null,
         deleted_at = now()
   where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
