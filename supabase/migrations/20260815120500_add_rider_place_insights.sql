-- 장소에서 직접 확인한 라이더 정보를 모으고, 원시 이동 기록을 공개하지 않은
-- 채 내 바이크와 맞는 장소를 익명 집계로 찾는다.

create table public.place_rider_fact_votes (
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  fact_code text not null,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id, fact_code),
  constraint place_rider_fact_votes_code_check check (
    fact_code in (
      'easy_parking',
      'rough_approach',
      'group_friendly',
      'helmet_storage',
      'night_friendly',
      'restroom'
    )
  )
);

comment on table public.place_rider_fact_votes is
  '등록 장소에서 라이더가 직접 확인한 편의·진입 정보. 원시 투표 행은 외부에 공개하지 않는다.';

create index place_rider_fact_votes_place_fact_idx
  on public.place_rider_fact_votes(place_id, fact_code, user_id);
create index place_rider_fact_votes_user_idx
  on public.place_rider_fact_votes(user_id);

alter table public.place_rider_fact_votes enable row level security;

-- 원시 행을 직접 읽으면 한 사용자의 방문 장소를 재구성할 수 있다. 클라이언트는
-- 아래 집계·토글 RPC만 사용하고 테이블 권한은 갖지 않는다.
revoke all on table public.place_rider_fact_votes from public, anon, authenticated;
grant all on table public.place_rider_fact_votes to service_role;

create or replace function public.get_place_rider_facts(p_place_id uuid)
returns table(fact_code text, confirmations integer, confirmed_by_me boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select
    v.fact_code,
    count(*)::integer as confirmations,
    coalesce(bool_or(v.user_id = auth.uid()), false) as confirmed_by_me
  from public.place_rider_fact_votes v
  join public.places p on p.id = v.place_id
  where v.place_id = p_place_id
    and p.approved = true
    and p.deleted_at is null
  group by v.fact_code;
$$;

create or replace function public.toggle_place_rider_fact(
  p_place_id uuid,
  p_fact_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_fact_code not in (
    'easy_parking',
    'rough_approach',
    'group_friendly',
    'helmet_storage',
    'night_friendly',
    'restroom'
  ) then
    raise exception 'invalid fact code';
  end if;
  if not exists (
    select 1
    from public.places
    where id = p_place_id and approved = true and deleted_at is null
  ) then
    raise exception 'place not found';
  end if;

  delete from public.place_rider_fact_votes
  where place_id = p_place_id
    and user_id = current_user_id
    and fact_code = p_fact_code;

  if found then
    return false;
  end if;

  insert into public.place_rider_fact_votes(place_id, user_id, fact_code)
  values (p_place_id, current_user_id, p_fact_code)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.get_place_rider_facts(uuid) from public;
revoke all on function public.toggle_place_rider_fact(uuid, text) from public;
grant execute on function public.get_place_rider_facts(uuid) to anon, authenticated, service_role;
grant execute on function public.toggle_place_rider_fact(uuid, text) to authenticated, service_role;

-- 라이딩 시점의 바이크 유형도 스냅샷으로 남긴다. 기존 모델 문자열처럼 나중에
-- 활성 바이크를 바꿔도 당시 기록과 추천 근거가 바뀌지 않는다.
alter table public.place_rides add column bike_category text;
alter table public.place_rides add constraint place_rides_bike_category_check
  check (bike_category is null or char_length(btrim(bike_category)) between 1 and 30);

create index place_rides_place_bike_category_idx
  on public.place_rides(place_id, bike_category, user_id)
  where place_id is not null and bike_category is not null;
create index place_rides_place_bike_model_idx
  on public.place_rides(place_id, bike_model, user_id)
  where place_id is not null and bike_model is not null;

-- 현재 사용자의 활성 기종은 서버에서 가져오고, 유형만 정적 기종표를 가진
-- 클라이언트가 넘긴다. 결과는 최소 두 라이더의 집계만 반환해 한 사람의 이동
-- 이력을 기종으로 훑어볼 수 없게 한다.
create or replace function public.bike_place_matches_v1(
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

revoke all on function public.bike_place_matches_v1(uuid[], text) from public, anon;
grant execute on function public.bike_place_matches_v1(uuid[], text) to authenticated, service_role;
