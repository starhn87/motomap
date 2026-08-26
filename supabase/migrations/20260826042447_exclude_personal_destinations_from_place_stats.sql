-- 집·회사 같은 개인 목적지는 실제 도착 이력으로 보존하되 장소 방문·추천 집계에는
-- 사용하지 않는다. 집/회사 구분이나 주소는 서버에 남기지 않고 제외 여부만 저장한다.

alter table public.place_rides
  add column excluded_from_place_stats boolean not null default false;

comment on column public.place_rides.excluded_from_place_stats is
  '집·회사 등 개인 목적지라 장소 방문·추천 집계에서 제외하는 기록. 실제 주행 이력 행은 보존한다.';

-- 본인 기록 화면과 개인 목적지 과거 기록 보정은 사용자·공개 상태를 항상 함께 거른다.
create index place_rides_user_visible_created_idx
  on public.place_rides(user_id, created_at desc)
  where excluded_from_place_stats = false;

-- 공개 장소 집계와 바이크 매칭에서 제외 행을 읽지 않도록 작은 부분 인덱스를 둔다.
create index place_rides_visible_place_bike_idx
  on public.place_rides(place_id, bike_model, user_id)
  where excluded_from_place_stats = false and place_id is not null;

-- 집·회사 좌표는 기기 밖으로 보내지 않는다. 앱은 본인의 미제외 기록 좌표를 받아
-- 로컬에서 비교하고, 일치한 기록 id만 아래 쓰기 함수에 돌려준다.
create or replace function public.my_unexcluded_place_ride_targets()
returns table(
  ride_id uuid,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id as ride_id,
    coalesce(
      public.st_y(p.location::public.geometry),
      gp.latitude,
      r.latitude
    ) as latitude,
    coalesce(
      public.st_x(p.location::public.geometry),
      gp.longitude,
      r.longitude
    ) as longitude
  from public.place_rides r
  left join public.places p on p.id = r.place_id
  left join public.general_places gp on gp.id = r.general_place_id
  where r.user_id = auth.uid()
    and r.excluded_from_place_stats = false;
$$;

create or replace function public.exclude_personal_place_rides(p_ride_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(array_length(p_ride_ids, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(p_ride_ids, 1) > 1000 then
    raise exception 'too many ride ids';
  end if;

  with updated as (
    update public.place_rides r
    set excluded_from_place_stats = true
    where r.user_id = current_user_id
      and r.excluded_from_place_stats = false
      and r.id = any(p_ride_ids)
    returning 1
  )
  select count(*)::integer into updated_count from updated;

  return updated_count;
end;
$$;

revoke all on function public.my_unexcluded_place_ride_targets()
  from public, anon;
revoke all on function public.exclude_personal_place_rides(uuid[])
  from public, anon;
grant execute on function public.my_unexcluded_place_ride_targets()
  to authenticated, service_role;
grant execute on function public.exclude_personal_place_rides(uuid[])
  to authenticated, service_role;

create or replace function public.my_ride_stats()
returns jsonb
language sql
stable
security definer
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
        where user_id = auth.uid()
          and excluded_from_place_stats = false
          and bike_model is not null
        group by bike_model
      ) t
    ), '[]'::jsonb)
  )
  from public.place_rides
  where user_id = auth.uid()
    and excluded_from_place_stats = false;
$$;

create or replace function public.place_ride_summary(
  p_place_id uuid,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (
      select count(*)
      from public.place_rides
      where place_id = p_place_id
        and excluded_from_place_stats = false
    ),
    'bikes', coalesce((
      select jsonb_agg(
               jsonb_build_object('model', t.model, 'riders', t.riders)
               order by t.riders desc, t.model
             )
      from (
        select bike_model as model, count(distinct user_id) as riders
        from public.place_rides
        where place_id = p_place_id
          and excluded_from_place_stats = false
          and bike_model is not null
        group by bike_model
        order by count(distinct user_id) desc, bike_model
        limit p_limit
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.unregistered_ride_spots(p_limit integer default 5)
returns table(
  name text,
  address text,
  rides bigint,
  riders bigint,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
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
  where r.place_id is null
    and r.name is not null
    and r.excluded_from_place_stats = false
  group by lower(btrim(r.name)), round(r.latitude::numeric, 2), round(r.longitude::numeric, 2)
  order by count(*) desc, count(distinct r.user_id) desc
  limit p_limit;
$$;

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
    and r.excluded_from_place_stats = false
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

create or replace function private.bike_place_matches_v1(
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
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_model text;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(array_length(p_place_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_place_ids, 1) > 200 then
    raise exception 'too many places';
  end if;
  if p_bike_category is not null
     and char_length(btrim(p_bike_category)) not between 1 and 30 then
    raise exception 'invalid bike category';
  end if;

  select coalesce(
    (
      select b.model
      from public.user_bikes b
      where b.user_id = current_user_id and b.is_active
      limit 1
    ),
    (
      select nullif(btrim(p.bike_model), '')
      from public.profiles p
      where p.id = current_user_id
    )
  ) into current_model;

  if current_model is null then
    return;
  end if;

  return query
  with aggregated as (
    select
      r.place_id,
      count(distinct r.user_id) filter (
        where r.bike_model = current_model
      )::integer as exact_riders,
      count(distinct r.user_id) filter (
        where r.bike_model is distinct from current_model
          and p_bike_category is not null
          and r.bike_category = p_bike_category
      )::integer as similar_riders,
      count(distinct r.user_id) filter (
        where r.bike_model = current_model
          or (
            p_bike_category is not null
            and r.bike_category = p_bike_category
          )
      )::integer as supporters,
      bool_or(r.user_id = current_user_id) as visited_by_me
    from public.place_rides r
    join public.places p on p.id = r.place_id
    where r.place_id = any(p_place_ids)
      and r.excluded_from_place_stats = false
      and p.approved = true
      and p.deleted_at is null
      and (
        r.bike_model = current_model
        or (
          p_bike_category is not null
          and r.bike_category = p_bike_category
        )
      )
    group by r.place_id
  )
  select
    a.place_id,
    a.exact_riders,
    a.similar_riders,
    a.supporters,
    case when a.exact_riders >= 2 then 'same_model' else 'same_category' end,
    a.visited_by_me
  from aggregated a
  where a.supporters >= 2;
end;
$$;

-- 기존 공개·내부 함수 권한은 교체 뒤에도 명시적으로 고정한다.
revoke all on function public.my_ride_stats() from public;
revoke all on function public.place_ride_summary(uuid, integer) from public;
revoke all on function public.unregistered_ride_spots(integer)
  from public, anon, authenticated;
revoke all on function private.bike_place_matches_v1(uuid[], text)
  from public, anon, authenticated;
revoke all on table private.unregistered_ride_candidates
  from public, anon, authenticated;

grant execute on function public.my_ride_stats() to authenticated, service_role;
grant execute on function public.place_ride_summary(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.unregistered_ride_spots(integer) to service_role;
grant execute on function private.bike_place_matches_v1(uuid[], text)
  to authenticated, service_role;
grant select on table private.unregistered_ride_candidates to service_role;
