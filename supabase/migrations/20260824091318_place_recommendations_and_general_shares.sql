-- 등록 장소의 명시적 추천과 일반 장소의 라이더 공유를 서로 다른 신호로 보존한다.
-- 원시 행은 이동·취향 이력을 노출할 수 있으므로 클라이언트에는 집계 RPC만 공개한다.

alter table public.places
  add column recommendation_count integer not null default 0,
  add column last_recommended_at timestamptz,
  add constraint places_recommendation_count_check check (recommendation_count >= 0);

alter table public.general_places
  add column share_count integer not null default 0,
  add column last_shared_at timestamptz,
  add constraint general_places_share_count_check check (share_count >= 0);

comment on column public.places.recommendation_count is
  '등록 장소를 다른 라이더에게 명시적으로 추천한 고유 계정 수';
comment on column public.general_places.share_count is
  '바이크 특화 검증과 무관하게 이 일반 장소를 라이더들과 공유한 고유 계정 수';

create table public.place_recommendations (
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create index place_recommendations_user_idx
  on public.place_recommendations(user_id, created_at desc);

comment on table public.place_recommendations is
  '승인된 등록 장소를 다른 라이더에게 권하는 명시적 추천. 원시 사용자별 행은 공개하지 않는다.';

alter table public.place_recommendations enable row level security;
revoke all on table public.place_recommendations from public, anon, authenticated;
grant all on table public.place_recommendations to service_role;

create table public.general_place_shares (
  general_place_id uuid not null references public.general_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (general_place_id, user_id)
);

create index general_place_shares_user_idx
  on public.general_place_shares(user_id, created_at desc);

comment on table public.general_place_shares is
  '바이크 특화 검증 없이 라이더들과 함께 가볼 일반 장소를 공유한 신호. 원시 사용자별 행은 공개하지 않는다.';

alter table public.general_place_shares enable row level security;
revoke all on table public.general_place_shares from public, anon, authenticated;
grant all on table public.general_place_shares to service_role;

create function private.refresh_place_recommendation_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_place_id uuid;
begin
  target_place_id := case when tg_op = 'DELETE' then old.place_id else new.place_id end;
  update public.places p
  set
    recommendation_count = summary.total,
    last_recommended_at = summary.latest
  from (
    select
      count(*)::integer as total,
      max(r.created_at) as latest
    from public.place_recommendations r
    where r.place_id = target_place_id
  ) summary
  where p.id = target_place_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger place_recommendations_refresh_summary
after insert or delete on public.place_recommendations
for each row execute function private.refresh_place_recommendation_summary();

revoke all on function private.refresh_place_recommendation_summary()
  from public, anon, authenticated;
grant execute on function private.refresh_place_recommendation_summary()
  to service_role;

create function private.refresh_general_place_share_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_general_place_id uuid;
begin
  target_general_place_id := case
    when tg_op = 'DELETE' then old.general_place_id
    else new.general_place_id
  end;
  update public.general_places gp
  set
    share_count = summary.total,
    last_shared_at = summary.latest
  from (
    select
      count(*)::integer as total,
      max(s.created_at) as latest
    from public.general_place_shares s
    where s.general_place_id = target_general_place_id
  ) summary
  where gp.id = target_general_place_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger general_place_shares_refresh_summary
after insert or delete on public.general_place_shares
for each row execute function private.refresh_general_place_share_summary();

revoke all on function private.refresh_general_place_share_summary()
  from public, anon, authenticated;
grant execute on function private.refresh_general_place_share_summary()
  to service_role;

create function private.get_place_recommendation(p_place_id uuid)
returns table(recommendation_count integer, recommended_by_me boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.recommendation_count,
    exists (
      select 1
      from public.place_recommendations r
      where r.place_id = p.id
        and r.user_id = auth.uid()
    ) as recommended_by_me
  from public.places p
  where p.id = p_place_id
    and p.approved = true
    and p.deleted_at is null;
$$;

create function private.toggle_place_recommendation(p_place_id uuid)
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

  if not exists (
    select 1
    from public.places p
    where p.id = p_place_id
      and p.approved = true
      and p.deleted_at is null
  ) then
    raise exception 'place not found';
  end if;

  delete from public.place_recommendations r
  where r.place_id = p_place_id
    and r.user_id = current_user_id;

  if found then
    return false;
  end if;

  insert into public.place_recommendations(place_id, user_id)
  values (p_place_id, current_user_id)
  on conflict do nothing;
  return true;
end;
$$;

create function private.get_general_place_share(p_general_place_id uuid)
returns table(share_count integer, shared_by_me boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select
    gp.share_count,
    exists (
      select 1
      from public.general_place_shares s
      where s.general_place_id = gp.id
        and s.user_id = auth.uid()
    ) as shared_by_me
  from public.general_places gp
  where gp.id = p_general_place_id
    and gp.promoted_place_id is null;
$$;

create function private.toggle_general_place_share(p_general_place_id uuid)
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

  if not exists (
    select 1
    from public.general_places gp
    where gp.id = p_general_place_id
      and gp.promoted_place_id is null
  ) then
    raise exception 'general place not found';
  end if;

  delete from public.general_place_shares s
  where s.general_place_id = p_general_place_id
    and s.user_id = current_user_id;

  if found then
    return false;
  end if;

  insert into public.general_place_shares(general_place_id, user_id)
  values (p_general_place_id, current_user_id)
  on conflict do nothing;
  return true;
end;
$$;

create function private.top_recommended_places(p_limit integer default 5)
returns table(
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  address text,
  phone text,
  photos text[],
  rating numeric,
  review_count integer,
  tags text[],
  opening_hours text,
  hours jsonb,
  parking_info text,
  submitted_by uuid,
  approved boolean,
  created_at timestamptz,
  recommendation_count integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with ride_counts as (
    select r.place_id, count(distinct r.user_id)::integer as riders
    from public.place_rides r
    where r.place_id is not null
    group by r.place_id
  ), fact_counts as (
    select v.place_id, count(*)::integer as confirmations
    from public.place_rider_fact_votes v
    group by v.place_id
  )
  select
    p.id,
    p.name,
    p.description,
    p.category,
    public.st_y(p.location::public.geometry) as latitude,
    public.st_x(p.location::public.geometry) as longitude,
    p.address,
    p.phone,
    p.photos,
    p.rating,
    p.review_count,
    p.tags,
    p.opening_hours,
    p.hours,
    p.parking_info,
    p.submitted_by,
    p.approved,
    p.created_at,
    p.recommendation_count
  from public.places p
  left join ride_counts rides on rides.place_id = p.id
  left join fact_counts facts on facts.place_id = p.id
  where p.approved = true
    and p.deleted_at is null
    and p.recommendation_count > 0
  order by
    p.recommendation_count desc,
    coalesce(rides.riders, 0) desc,
    (
      (coalesce(p.rating, 0) * coalesce(p.review_count, 0) + 3.5 * 5)
      / (coalesce(p.review_count, 0) + 5)
    ) desc,
    coalesce(facts.confirmations, 0) desc,
    p.last_recommended_at desc,
    p.id
  limit greatest(0, least(coalesce(p_limit, 5), 5));
$$;

revoke all on function private.get_place_recommendation(uuid)
  from public, anon, authenticated;
revoke all on function private.toggle_place_recommendation(uuid)
  from public, anon, authenticated;
revoke all on function private.get_general_place_share(uuid)
  from public, anon, authenticated;
revoke all on function private.toggle_general_place_share(uuid)
  from public, anon, authenticated;
revoke all on function private.top_recommended_places(integer)
  from public, anon, authenticated;

grant execute on function private.get_place_recommendation(uuid)
  to anon, authenticated, service_role;
grant execute on function private.toggle_place_recommendation(uuid)
  to authenticated, service_role;
grant execute on function private.get_general_place_share(uuid)
  to anon, authenticated, service_role;
grant execute on function private.toggle_general_place_share(uuid)
  to authenticated, service_role;
grant execute on function private.top_recommended_places(integer)
  to anon, authenticated, service_role;

create function public.get_place_recommendation(p_place_id uuid)
returns table(recommendation_count integer, recommended_by_me boolean)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_place_recommendation(p_place_id);
$$;

create function public.toggle_place_recommendation(p_place_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.toggle_place_recommendation(p_place_id);
$$;

create function public.get_general_place_share(p_general_place_id uuid)
returns table(share_count integer, shared_by_me boolean)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_general_place_share(p_general_place_id);
$$;

create function public.toggle_general_place_share(p_general_place_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.toggle_general_place_share(p_general_place_id);
$$;

create function public.top_recommended_places(p_limit integer default 5)
returns table(
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  address text,
  phone text,
  photos text[],
  rating numeric,
  review_count integer,
  tags text[],
  opening_hours text,
  hours jsonb,
  parking_info text,
  submitted_by uuid,
  approved boolean,
  created_at timestamptz,
  recommendation_count integer
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.top_recommended_places(p_limit);
$$;

revoke all on function public.get_place_recommendation(uuid) from public;
revoke all on function public.toggle_place_recommendation(uuid) from public, anon;
revoke all on function public.get_general_place_share(uuid) from public;
revoke all on function public.toggle_general_place_share(uuid) from public, anon;
revoke all on function public.top_recommended_places(integer) from public;

grant execute on function public.get_place_recommendation(uuid)
  to anon, authenticated, service_role;
grant execute on function public.toggle_place_recommendation(uuid)
  to authenticated, service_role;
grant execute on function public.get_general_place_share(uuid)
  to anon, authenticated, service_role;
grant execute on function public.toggle_general_place_share(uuid)
  to authenticated, service_role;
grant execute on function public.top_recommended_places(integer)
  to anon, authenticated, service_role;
