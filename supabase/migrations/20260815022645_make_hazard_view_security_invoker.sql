-- 공개 view도 호출자의 권한과 RLS를 따르게 한다. 원본 테이블은 공개에 필요한
-- 열만 column-level SELECT를 허용해 reported_by를 Data API에서 읽을 수 없게 한다.

revoke all on table public.road_hazards from anon, authenticated;

grant select (
  id,
  location,
  type,
  note,
  photo,
  address,
  created_at,
  last_confirmed_at,
  confirm_count,
  resolved_count,
  deleted_at
) on public.road_hazards to anon, authenticated;

grant insert (
  location,
  type,
  note,
  photo,
  address,
  reported_by
) on public.road_hazards to authenticated;

drop policy if exists "road_hazards 조회는 제보자만" on public.road_hazards;
create policy "road_hazards 공개 정보 조회" on public.road_hazards
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and resolved_count < 2
    and last_confirmed_at > now() - (public.hazard_fresh_days(type) * 2 || ' days')::interval
  );

create or replace view public.live_road_hazards
with (security_invoker = true)
as
  select
    h.id,
    h.location,
    h.type,
    h.note,
    h.photo,
    h.address,
    h.created_at,
    h.last_confirmed_at,
    h.confirm_count,
    h.resolved_count,
    h.deleted_at,
    st_y(h.location::geometry) as latitude,
    st_x(h.location::geometry) as longitude,
    case
      when h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) || ' days')::interval
      then 0 else 1
    end as staleness
  from public.road_hazards h
  where h.deleted_at is null
    and h.resolved_count < 2
    and h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) * 2 || ' days')::interval;

revoke all on public.live_road_hazards from public;
grant select on public.live_road_hazards to anon, authenticated, service_role;
