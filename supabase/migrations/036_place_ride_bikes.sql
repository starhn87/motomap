-- 라이딩 기록에 "그때 탄 바이크"를 남기고, 장소별 기종 집계를 연다.
--
-- 기종을 profiles 에서 조인하면 바이크를 바꾼 순간 과거 기록까지 새 기종으로
-- 바뀐다 — 라이딩은 그때 그 바이크로 간 사실이므로 기록 시점 값을 박아 둔다.
--
-- 원시 행(user_id·장소·시각)은 본인 것만 보이게 좁힌다. 지금까지는 전체 공개라
-- user_id 를 아는 사람이 특정인의 이동 이력을 재구성할 수 있었다. 장소 상세가
-- 쓰는 공개 집계는 아래 SECURITY DEFINER 함수가 대신한다.

alter table public.place_rides add column if not exists bike_model text;

-- 어제 시작된 기록이라 현재 프로필 기종이 사실상 그때 탄 바이크다 — 1회 백필
update public.place_rides r
set bike_model = p.bike_model
from public.profiles p
where p.id = r.user_id
  and r.bike_model is null
  and p.bike_model is not null;

-- 장소 라이딩 요약 — 총 횟수 + 기종별 "라이더 수" top N.
-- 횟수가 아니라 distinct 라이더인 이유: 한 명이 열 번 가도 "이 바이크로 온 사람"은 하나다.
create or replace function public.place_ride_summary(p_place_id uuid, p_limit int default 5)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.place_rides where place_id = p_place_id),
    'bikes', coalesce((
      select jsonb_agg(
               jsonb_build_object('model', t.model, 'riders', t.riders)
               order by t.riders desc, t.model
             )
      from (
        select bike_model as model, count(distinct user_id) as riders
        from public.place_rides
        where place_id = p_place_id and bike_model is not null
        group by bike_model
        order by count(distinct user_id) desc, bike_model
        limit p_limit
      ) t
    ), '[]'::jsonb)
  );
$$;

-- 내 라이딩 통계 — 전체(장소 수·횟수)와 기종별 횟수
create or replace function public.my_ride_stats()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'rides', count(*),
    'places', count(distinct place_id),
    'bikes', coalesce((
      select jsonb_agg(jsonb_build_object('model', t.model, 'rides', t.rides) order by t.rides desc)
      from (
        select bike_model as model, count(*) as rides
        from public.place_rides
        where user_id = auth.uid() and bike_model is not null
        group by bike_model
      ) t
    ), '[]'::jsonb)
  )
  from public.place_rides
  where user_id = auth.uid();
$$;

drop policy if exists "place_rides_select_all" on public.place_rides;
create policy "place_rides_select_own" on public.place_rides
  for select using (auth.uid() = user_id);
