-- 권한 상승이 필요한 구현은 Data API에 노출되지 않는 스키마로 옮기고,
-- public에는 기존 앱 서명을 유지하는 SECURITY INVOKER 래퍼만 둔다.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

alter function public.get_place_rider_facts(uuid) set schema private;
alter function public.toggle_place_rider_fact(uuid, text) set schema private;
alter function public.bike_place_matches_v1(uuid[], text) set schema private;

revoke all on function private.get_place_rider_facts(uuid) from public, anon, authenticated;
revoke all on function private.toggle_place_rider_fact(uuid, text) from public, anon, authenticated;
revoke all on function private.bike_place_matches_v1(uuid[], text) from public, anon, authenticated;
grant execute on function private.get_place_rider_facts(uuid) to anon, authenticated, service_role;
grant execute on function private.toggle_place_rider_fact(uuid, text) to authenticated, service_role;
grant execute on function private.bike_place_matches_v1(uuid[], text) to authenticated, service_role;

create function public.get_place_rider_facts(p_place_id uuid)
returns table(fact_code text, confirmations integer, confirmed_by_me boolean)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_place_rider_facts(p_place_id);
$$;

create function public.toggle_place_rider_fact(
  p_place_id uuid,
  p_fact_code text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.toggle_place_rider_fact(p_place_id, p_fact_code);
$$;

create function public.bike_place_matches_v1(
  p_place_ids uuid[],
  p_bike_category text default null
)
returns table(
  place_id uuid,
  exact_riders integer,
  similar_riders integer,
  supporters integer,
  match_kind text,
  visited_by_me boolean
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.bike_place_matches_v1(p_place_ids, p_bike_category);
$$;

revoke all on function public.get_place_rider_facts(uuid) from public;
revoke all on function public.toggle_place_rider_fact(uuid, text) from public;
revoke all on function public.bike_place_matches_v1(uuid[], text) from public, anon;
grant execute on function public.get_place_rider_facts(uuid) to anon, authenticated, service_role;
grant execute on function public.toggle_place_rider_fact(uuid, text) to authenticated, service_role;
grant execute on function public.bike_place_matches_v1(uuid[], text) to authenticated, service_role;
