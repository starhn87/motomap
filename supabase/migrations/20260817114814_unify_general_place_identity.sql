-- 카카오 등 외부 검색 장소도 리뷰·즐겨찾기·도착 기록이 같은 대상을 바라보게 한다.
-- 이후 모토맵 등록 장소로 승인되면 관련 기록을 자동으로 승격한다.

create table public.general_places (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_place_id text not null,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  phone text,
  place_url text,
  promoted_place_id uuid unique references public.places(id) on delete set null,
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint general_places_provider_check check (provider in ('kakao', 'coordinate')),
  constraint general_places_provider_place_id_check
    check (char_length(provider_place_id) between 1 and 200),
  constraint general_places_name_check
    check (char_length(btrim(name)) between 1 and 200),
  constraint general_places_address_check
    check (char_length(btrim(address)) between 1 and 500),
  constraint general_places_latitude_check check (latitude between -90 and 90),
  constraint general_places_longitude_check check (longitude between -180 and 180),
  constraint general_places_rating_check check (rating between 0 and 5),
  constraint general_places_review_count_check check (review_count >= 0),
  unique (provider, provider_place_id)
);

comment on table public.general_places is
  '카카오 등 외부 검색에서 발견한 일반 장소의 안정적인 식별자. 등록 장소로 승인되면 promoted_place_id로 연결한다.';
comment on column public.general_places.provider_place_id is
  '외부 공급자의 장소 ID. 좌표 기반 레거시 장소는 반올림한 좌표 키를 사용한다.';
comment on column public.general_places.promoted_place_id is
  '같은 장소가 모토맵 등록 장소로 승인된 경우의 places.id';

alter table public.general_places enable row level security;

create policy "일반 장소 공개 조회"
on public.general_places for select
to anon, authenticated
using (true);

create policy "로그인 사용자 일반 장소 생성"
on public.general_places for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and promoted_place_id is null
  and rating = 0
  and review_count = 0
);

revoke all on table public.general_places from public, anon, authenticated;
grant select on table public.general_places to anon, authenticated;
grant insert on table public.general_places to authenticated;
grant all on table public.general_places to service_role;

alter table public.reviews
  add column general_place_id uuid references public.general_places(id) on delete restrict;

alter table public.reviews
  add constraint reviews_target_check
  check (num_nonnulls(place_id, general_place_id) = 1);

create index reviews_general_place_id_idx
  on public.reviews (general_place_id, created_at desc)
  where general_place_id is not null;

drop policy if exists "리뷰 작성" on public.reviews;
create policy "리뷰 작성"
on public.reviews for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    general_place_id is null
    or exists (
      select 1
      from public.general_places gp
      where gp.id = general_place_id
        and gp.promoted_place_id is null
    )
  )
);

drop policy if exists "리뷰 수정" on public.reviews;
create policy "리뷰 수정"
on public.reviews for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    general_place_id is null
    or exists (
      select 1
      from public.general_places gp
      where gp.id = general_place_id
        and gp.promoted_place_id is null
    )
  )
);

create or replace function public.update_place_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_place_id uuid;
  new_place_id uuid;
  old_general_place_id uuid;
  new_general_place_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_place_id := old.place_id;
    old_general_place_id := old.general_place_id;
  end if;

  if tg_op <> 'DELETE' then
    new_place_id := new.place_id;
    new_general_place_id := new.general_place_id;
  end if;

  if old_place_id is not null then
    update public.places
    set
      rating = coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.place_id = old_place_id
      ), 0),
      review_count = (
        select count(*)
        from public.reviews r
        where r.place_id = old_place_id
      )
    where id = old_place_id;
  end if;

  if new_place_id is not null and new_place_id is distinct from old_place_id then
    update public.places
    set
      rating = coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.place_id = new_place_id
      ), 0),
      review_count = (
        select count(*)
        from public.reviews r
        where r.place_id = new_place_id
      )
    where id = new_place_id;
  end if;

  if old_general_place_id is not null then
    update public.general_places
    set
      rating = coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.general_place_id = old_general_place_id
      ), 0),
      review_count = (
        select count(*)
        from public.reviews r
        where r.general_place_id = old_general_place_id
      )
    where id = old_general_place_id;
  end if;

  if new_general_place_id is not null
     and new_general_place_id is distinct from old_general_place_id then
    update public.general_places
    set
      rating = coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.general_place_id = new_general_place_id
      ), 0),
      review_count = (
        select count(*)
        from public.reviews r
        where r.general_place_id = new_general_place_id
      )
    where id = new_general_place_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.update_place_rating() from public, anon, authenticated;
grant execute on function public.update_place_rating() to service_role;

alter table public.favorites
  add column general_place_id uuid references public.general_places(id) on delete restrict;

alter table public.favorites
  drop constraint favorites_target_check;

alter table public.favorites
  add constraint favorites_target_check check (
    (
      place_id is not null
      and general_place_id is null
      and latitude is null
      and longitude is null
      and name is null
    )
    or
    (
      place_id is null
      and latitude is not null
      and longitude is not null
      and name is not null
    )
  );

create unique index favorites_user_general_place_unique
  on public.favorites (user_id, general_place_id)
  where general_place_id is not null;

alter table public.place_rides
  add column general_place_id uuid references public.general_places(id) on delete restrict;

alter table public.place_rides
  drop constraint place_rides_target_check;

alter table public.place_rides
  add constraint place_rides_target_check check (
    (
      place_id is not null
      and general_place_id is null
      and latitude is null
      and longitude is null
      and name is null
    )
    or
    (
      place_id is null
      and latitude is not null
      and longitude is not null
      and name is not null
    )
  );

create index place_rides_general_place_id_idx
  on public.place_rides (general_place_id, created_at desc)
  where general_place_id is not null;

alter table public.places
  add column source_provider text,
  add column source_place_id text;

alter table public.places
  add constraint places_source_identity_check check (
    (source_provider is null and source_place_id is null)
    or
    (
      source_provider in ('kakao', 'coordinate')
      and source_place_id is not null
      and char_length(source_place_id) between 1 and 200
    )
  );

create unique index places_source_identity_unique
  on public.places (source_provider, source_place_id)
  where source_place_id is not null and deleted_at is null;

create or replace function public.promote_general_place_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_general_place_id uuid;
begin
  if new.approved is not true
     or new.deleted_at is not null
     or new.source_provider is null
     or new.source_place_id is null then
    return new;
  end if;

  select gp.id
  into target_general_place_id
  from public.general_places gp
  where gp.provider = new.source_provider
    and gp.provider_place_id = new.source_place_id
  limit 1;

  if target_general_place_id is null then
    return new;
  end if;

  delete from public.favorites general_favorite
  where general_favorite.general_place_id = target_general_place_id
    and exists (
      select 1
      from public.favorites registered_favorite
      where registered_favorite.user_id = general_favorite.user_id
        and registered_favorite.place_id = new.id
    );

  update public.favorites
  set
    place_id = new.id,
    general_place_id = null,
    name = null,
    address = null,
    latitude = null,
    longitude = null,
    phone = null
  where general_place_id = target_general_place_id;

  update public.place_rides
  set
    place_id = new.id,
    general_place_id = null,
    name = null,
    address = null,
    latitude = null,
    longitude = null
  where general_place_id = target_general_place_id;

  update public.reviews
  set
    place_id = new.id,
    general_place_id = null
  where general_place_id = target_general_place_id;

  update public.general_places
  set promoted_place_id = new.id
  where id = target_general_place_id;

  return new;
end;
$$;

drop trigger if exists places_promote_general_place on public.places;
create trigger places_promote_general_place
after insert or update of approved, source_provider, source_place_id
on public.places
for each row
when (new.approved is true and new.deleted_at is null)
execute function public.promote_general_place_on_approval();

revoke all on function public.promote_general_place_on_approval()
  from public, anon, authenticated;
grant execute on function public.promote_general_place_on_approval()
  to service_role;
