-- 등록되지 않은 일반 장소 도착도 기록한다 (앱 표시는 하지 않는다).
--
-- 일반 장소에는 안정적인 id 가 없어 favorites(032)처럼 이름+좌표로 식별해야
-- 하는데, 즐겨찾기는 "한 사람 안에서" 중복만 막으면 되는 반면 라이딩 횟수는
-- 여러 사람 것을 합쳐야 한다. 진입 경로(검색 결과 / 지도 심벌 탭)에 따라 같은
-- 가게의 좌표가 미세하게 달라, 합치면 과소집계가 되고 반올림을 키우면 옆 가게가
-- 뭉친다 — 그래서 사용자에게 "N번 달려온 곳"으로 보여주지는 않는다.
--
-- 대신 "라이더가 실제로 갔는데 아직 등록 안 된 곳"이라는 시드 발굴 신호로 쓴다.
-- 이 용도는 좀 쪼개져도 후보가 떠오르는 데 지장이 없고, 검색만 한 기록보다 강한
-- 신호다(실제로 갔다는 뜻). 주간 다이제스트가 읽어 간다.

alter table public.place_rides
  alter column place_id drop not null,
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- 둘 중 하나여야 한다 — 등록 장소이거나, 좌표를 가진 일반 장소이거나
alter table public.place_rides
  drop constraint if exists place_rides_target_check;
alter table public.place_rides
  add constraint place_rides_target_check check (
    (place_id is not null
      and latitude is null and longitude is null and name is null)
    or
    (place_id is null
      and latitude is not null and longitude is not null and name is not null)
  );

-- 시드 우선순위: 라이더가 도착했지만 아직 등록되지 않은 곳.
-- 이름 + 약 1km 격자로 묶는다 — 진입 경로에 따라 미세하게 다른 좌표는 합치고,
-- 같은 상호의 다른 지역 지점은 분리하기 위한 절충.
--
-- 집계만 돌려준다(개별 user_id·시각 없음). 원시 행은 036 정책대로 본인 것만.
create or replace function public.unregistered_ride_spots(p_limit int default 5)
returns table (
  name text,
  address text,
  rides bigint,
  riders bigint,
  latitude double precision,
  longitude double precision
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    max(r.name) as name,
    max(r.address) as address,
    count(*) as rides,
    count(distinct r.user_id) as riders,
    avg(r.latitude) as latitude,
    avg(r.longitude) as longitude
  from public.place_rides r
  where r.place_id is null and r.name is not null
  group by lower(btrim(r.name)), round(r.latitude::numeric, 2), round(r.longitude::numeric, 2)
  order by count(*) desc, count(distinct r.user_id) desc
  limit p_limit;
$$;
