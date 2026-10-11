-- 관리용 캐시 정리는 서버에서만 실행한다.
-- 운영 적용 승인 전에는 이 파일을 DB에 실행하지 않는다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.purge_google_place_hours()'::regprocedure
      and md5(prosrc) = 'c463c1a90cc40d59755ea82a98168cf2'
      and prosecdef
  ) then
    raise exception 'Maintenance cache cleanup function changed; review required';
  end if;
end;
$guard$;

create or replace function public.purge_google_place_hours()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.google_place_hours where fetched_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_google_place_hours() from public, anon, authenticated;
grant execute on function public.purge_google_place_hours() to service_role;

-- 함수 본문을 호출하지 않는다. 현재 캐시 행은 이 마이그레이션에서 삭제하지 않는다.
do $verify$
begin
  if has_function_privilege('anon', 'public.purge_google_place_hours()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.purge_google_place_hours()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.purge_google_place_hours()', 'EXECUTE') then
    raise exception 'Maintenance cache cleanup must be service-only';
  end if;
end;
$verify$;
commit;
