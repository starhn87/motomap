-- 읽기는 기존 place_rides_select_own RLS를 그대로 따르고, 쓰기 권한 상승 구현은
-- Data API에 노출되지 않는 private 스키마로 옮긴다. public에는 기존 앱 서명의
-- SECURITY INVOKER 래퍼만 남긴다.

alter function public.my_unexcluded_place_ride_targets() security invoker;

alter function public.exclude_personal_place_rides(uuid[]) set schema private;

revoke all on function private.exclude_personal_place_rides(uuid[])
  from public, anon, authenticated;
grant execute on function private.exclude_personal_place_rides(uuid[])
  to authenticated, service_role;

create function public.exclude_personal_place_rides(p_ride_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.exclude_personal_place_rides(p_ride_ids);
$$;

revoke all on function public.exclude_personal_place_rides(uuid[])
  from public, anon;
grant execute on function public.exclude_personal_place_rides(uuid[])
  to authenticated, service_role;
