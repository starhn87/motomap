-- profiles.bike_model 단일 문자열을 호환용 mirror로 유지하면서, 한 사람이 여러
-- 바이크의 이름·연식·색상·사진과 활성 상태를 관리할 수 있는 차고를 만든다.

create table public.user_bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  model text not null,
  nickname text,
  model_year smallint,
  color text,
  photo_url text,
  is_active boolean not null default false,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_bikes_model_check check (char_length(btrim(model)) between 1 and 60),
  constraint user_bikes_nickname_check check (nickname is null or char_length(nickname) <= 30),
  constraint user_bikes_year_check check (model_year is null or model_year between 1900 and 2100),
  constraint user_bikes_color_check check (color is null or char_length(color) <= 30),
  constraint user_bikes_active_retired_check check (not (is_active and retired_at is not null))
);

comment on table public.user_bikes is '사용자의 멀티바이크 차고. 활성 바이크는 profiles.bike_model에 mirror된다.';

create index user_bikes_user_id_idx on public.user_bikes(user_id, created_at desc);
create unique index user_bikes_one_active_idx on public.user_bikes(user_id) where is_active;

alter table public.user_bikes enable row level security;

create policy "user_bikes_select_own" on public.user_bikes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_bikes_insert_own" on public.user_bikes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_bikes_update_own" on public.user_bikes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_bikes_delete_own" on public.user_bikes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_bikes from public, anon;
grant select, insert, update, delete on table public.user_bikes to authenticated;
grant all on table public.user_bikes to service_role;

-- 기존 단일 바이크를 첫 활성 바이크로 무손실 이관한다.
insert into public.user_bikes (user_id, model, is_active)
select id, btrim(bike_model), true
from public.profiles
where nullif(btrim(bike_model), '') is not null;

create or replace function public.touch_user_bike_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_bikes_touch_updated_at
before update on public.user_bikes
for each row execute function public.touch_user_bike_updated_at();

-- 차고를 수정하면 구버전 앱이 읽는 profiles.bike_model도 같은 활성 기종으로 맞춘다.
create or replace function public.sync_profile_from_user_bikes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  active_model text;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
  else
    target_user_id := new.user_id;
  end if;

  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select b.model into active_model
  from public.user_bikes b
  where b.user_id = target_user_id and b.is_active
  limit 1;

  update public.profiles
  set bike_model = active_model
  where id = target_user_id and bike_model is distinct from active_model;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger user_bikes_sync_profile
after insert or update or delete on public.user_bikes
for each row execute function public.sync_profile_from_user_bikes();

-- 구버전 앱이 profiles.bike_model을 직접 바꿔도 활성 차고 행을 갱신/생성한다.
create or replace function public.sync_user_bikes_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_id uuid;
  next_model text := nullif(btrim(new.bike_model), '');
begin
  if pg_trigger_depth() > 1 or new.bike_model is not distinct from old.bike_model then
    return new;
  end if;

  select b.id into active_id
  from public.user_bikes b
  where b.user_id = new.id and b.is_active
  limit 1;

  if next_model is null then
    update public.user_bikes set is_active = false where id = active_id;
  elsif active_id is not null then
    update public.user_bikes
    set model = next_model, retired_at = null
    where id = active_id;
  else
    insert into public.user_bikes (user_id, model, is_active)
    values (new.id, next_model, true);
  end if;
  return new;
end;
$$;

create trigger profiles_sync_user_bikes
after update of bike_model on public.profiles
for each row execute function public.sync_user_bikes_from_profile();

-- 활성 전환은 부분 unique index와 충돌하지 않도록 한 트랜잭션에서 먼저 끄고 켠다.
create or replace function public.set_active_user_bike(p_bike_id uuid)
returns void
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
    select 1 from public.user_bikes
    where id = p_bike_id and user_id = current_user_id
  ) then
    raise exception 'bike not found';
  end if;

  update public.user_bikes set is_active = false
  where user_id = current_user_id and is_active;
  update public.user_bikes
  set is_active = true, retired_at = null
  where id = p_bike_id and user_id = current_user_id;
end;
$$;

-- 활성 바이크를 지우면 남은 차고의 최신 바이크를 자동으로 활성화한다.
create or replace function public.delete_user_bike(p_bike_id uuid)
returns void
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

  delete from public.user_bikes
  where id = p_bike_id and user_id = current_user_id;
  if not found then
    raise exception 'bike not found';
  end if;

  if not exists (
    select 1 from public.user_bikes
    where user_id = current_user_id and is_active
  ) then
    update public.user_bikes
    set is_active = true, retired_at = null
    where id = (
      select id from public.user_bikes
      where user_id = current_user_id
      order by updated_at desc
      limit 1
    );
  end if;
end;
$$;

revoke all on function public.touch_user_bike_updated_at() from public, anon, authenticated;
revoke all on function public.sync_profile_from_user_bikes() from public, anon, authenticated;
revoke all on function public.sync_user_bikes_from_profile() from public, anon, authenticated;
revoke all on function public.set_active_user_bike(uuid) from public, anon;
revoke all on function public.delete_user_bike(uuid) from public, anon;
grant execute on function public.set_active_user_bike(uuid) to authenticated;
grant execute on function public.delete_user_bike(uuid) to authenticated;
grant execute on function public.touch_user_bike_updated_at() to service_role;
grant execute on function public.sync_profile_from_user_bikes() to service_role;
grant execute on function public.sync_user_bikes_from_profile() to service_role;

-- 방문·리뷰에도 안정적인 차고 id를 함께 남긴다. 모델 문자열은 삭제 후에도 당시
-- 관점을 표시하는 스냅샷으로 유지한다.
alter table public.place_rides
  add column bike_id uuid references public.user_bikes(id) on delete set null;
alter table public.reviews
  add column bike_id uuid references public.user_bikes(id) on delete set null;
alter table public.course_reviews
  add column bike_id uuid references public.user_bikes(id) on delete set null;

create index place_rides_bike_id_idx on public.place_rides(bike_id) where bike_id is not null;
create index reviews_bike_id_idx on public.reviews(bike_id) where bike_id is not null;
create index course_reviews_bike_id_idx on public.course_reviews(bike_id) where bike_id is not null;

create or replace function public.set_review_bike_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_bike_id uuid;
  selected_model text;
begin
  if tg_op = 'UPDATE' then
    new.bike_id := old.bike_id;
    new.bike_model := old.bike_model;
    return new;
  end if;

  if new.bike_id is not null then
    select b.id, b.model into selected_bike_id, selected_model
    from public.user_bikes b
    where b.id = new.bike_id and b.user_id = new.user_id;
  else
    select b.id, b.model into selected_bike_id, selected_model
    from public.user_bikes b
    where b.user_id = new.user_id and b.is_active
    limit 1;
  end if;

  new.bike_id := selected_bike_id;
  new.bike_model := coalesce(
    selected_model,
    nullif(btrim(new.bike_model), ''),
    (select p.bike_model from public.profiles p where p.id = new.user_id)
  );
  return new;
end;
$$;

create or replace function public.set_place_ride_bike_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_bike_id uuid;
  active_model text;
begin
  select b.id, b.model into active_bike_id, active_model
  from public.user_bikes b
  where b.user_id = new.user_id and b.is_active
  limit 1;

  new.bike_id := active_bike_id;
  new.bike_model := coalesce(
    active_model,
    nullif(btrim(new.bike_model), ''),
    (select p.bike_model from public.profiles p where p.id = new.user_id)
  );
  return new;
end;
$$;

create trigger place_rides_bike_snapshot
before insert on public.place_rides
for each row execute function public.set_place_ride_bike_snapshot();

revoke all on function public.set_review_bike_snapshot() from public, anon, authenticated;
revoke all on function public.set_place_ride_bike_snapshot() from public, anon, authenticated;
grant execute on function public.set_review_bike_snapshot() to service_role;
grant execute on function public.set_place_ride_bike_snapshot() to service_role;
