-- 도착 기록 기반 장소 후보는 운영자만 보는 private 뷰에서 점수화한다.
-- 주거지로 보이는 이름은 후보에서 제외하고, 라이더 수·반복 도착·최근성을
-- 함께 보므로 한 사람의 반복 테스트가 상위로 치우치지 않는다.
create or replace view private.unregistered_ride_candidates
with (security_invoker = true)
as
with candidates as (
  select
    max(r.name) as name,
    max(r.address) as address,
    avg(r.latitude) as latitude,
    avg(r.longitude) as longitude,
    count(*) as rides,
    count(distinct r.user_id) as riders,
    count(*) filter (where r.created_at >= now() - interval '30 days') as recent_rides,
    max(r.created_at) as last_arrived_at
  from public.place_rides r
  where r.place_id is null
    and r.name is not null
    and r.name !~* '(아파트|빌라|주택|오피스텔|우리집|자택|^집$|^회사$)'
  group by
    lower(btrim(r.name)),
    round(r.latitude::numeric, 2),
    round(r.longitude::numeric, 2)
)
select
  c.name,
  c.address,
  c.latitude,
  c.longitude,
  c.rides,
  c.riders,
  c.recent_rides,
  c.last_arrived_at,
  (
    c.riders * 5
    + least(c.rides, 10) * 2
    + least(c.recent_rides, 10) * 3
    + greatest(
        0,
        10 - floor(extract(epoch from (now() - c.last_arrived_at)) / 1209600)::bigint
      )
  )::integer as candidate_score
from candidates c;

revoke all on table private.unregistered_ride_candidates
  from public, anon, authenticated;
grant select on table private.unregistered_ride_candidates
  to service_role;
