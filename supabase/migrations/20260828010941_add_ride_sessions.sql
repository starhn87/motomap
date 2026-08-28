-- 모토맵 길안내 중 사용자가 명시적으로 켠 실제 경로 기록.
-- 경로는 공개 장소 통계와 달리 본인만 볼 수 있는 민감 위치 데이터다.

create table public.ride_recording_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  consented_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint ride_recording_consents_period_check check (
    expires_at > consented_at
    and expires_at <= consented_at + interval '1 year'
    and (revoked_at is null or revoked_at >= consented_at)
  )
);

create unique index ride_recording_consents_one_active_idx
  on public.ride_recording_consents(user_id)
  where revoked_at is null;
create index ride_recording_consents_user_history_idx
  on public.ride_recording_consents(user_id, consented_at desc);

comment on table public.ride_recording_consents is
  '개인 라이딩 경로의 수집·이용·최대 1년 보관에 대한 별도 동의 이력';

alter table public.ride_recording_consents enable row level security;

create policy "ride_recording_consents_select_own"
on public.ride_recording_consents for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.ride_recording_consents from public, anon, authenticated;
grant select on table public.ride_recording_consents to authenticated;
grant all on table public.ride_recording_consents to service_role;

create or replace function public.consent_ride_recording()
returns table(consent_id uuid, consented_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_policy_version constant text := '2026-08-28';
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- 같은 계정의 빠른 중복 탭도 하나의 활성 동의만 만들도록 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  update public.ride_recording_consents consent
  set revoked_at = v_now
  where consent.user_id = v_user_id
    and consent.revoked_at is null
    and (
      consent.expires_at <= v_now
      or consent.policy_version <> v_policy_version
    );

  return query
  select consent.id, consent.consented_at, consent.expires_at
  from public.ride_recording_consents consent
  where consent.user_id = v_user_id
    and consent.revoked_at is null
    and consent.expires_at > v_now
    and consent.policy_version = v_policy_version;
  if found then
    return;
  end if;

  return query
  insert into public.ride_recording_consents as consent (
    user_id,
    policy_version,
    consented_at,
    expires_at
  ) values (
    v_user_id,
    v_policy_version,
    v_now,
    v_now + interval '1 year'
  )
  returning consent.id, consent.consented_at, consent.expires_at;
end;
$$;

create or replace function private.ride_segment_point_count(payload jsonb)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(sum(jsonb_array_length(segment)), 0)::integer
  from jsonb_array_elements(payload) as segments(segment)
  where jsonb_typeof(segment) = 'array';
$$;

create or replace function private.valid_ride_segments(payload jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  segment jsonb;
  point jsonb;
  longitude numeric;
  latitude numeric;
  elapsed_ms numeric;
  last_elapsed_ms numeric := -1;
  total_points integer := 0;
begin
  if jsonb_typeof(payload) <> 'array'
     or jsonb_array_length(payload) = 0
     or jsonb_array_length(payload) > 200
     or octet_length(payload::text) > 6291456 then
    return false;
  end if;

  for segment in select value from jsonb_array_elements(payload)
  loop
    if jsonb_typeof(segment) <> 'array'
       or jsonb_array_length(segment) < 2
       or jsonb_array_length(segment) > 20000 then
      return false;
    end if;

    for point in select value from jsonb_array_elements(segment)
    loop
      if jsonb_typeof(point) <> 'array'
         or jsonb_array_length(point) <> 3
         or jsonb_typeof(point -> 0) <> 'number'
         or jsonb_typeof(point -> 1) <> 'number'
         or jsonb_typeof(point -> 2) <> 'number' then
        return false;
      end if;

      longitude := (point ->> 0)::numeric;
      latitude := (point ->> 1)::numeric;
      elapsed_ms := (point ->> 2)::numeric;

      if longitude < -180 or longitude > 180
         or latitude < -90 or latitude > 90
         or elapsed_ms < 0
         or elapsed_ms > 604800000
         or elapsed_ms <> trunc(elapsed_ms)
         or elapsed_ms < last_elapsed_ms then
        return false;
      end if;

      last_elapsed_ms := elapsed_ms;
      total_points := total_points + 1;
      if total_points > 50000 then
        return false;
      end if;
    end loop;
  end loop;

  return total_points >= 2;
exception
  when others then
    return false;
end;
$$;

create table public.ride_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_id uuid not null references public.ride_recording_consents(id),
  bike_id uuid references public.user_bikes(id) on delete set null,
  bike_model text,
  bike_nickname text,
  goal_place_id uuid references public.places(id) on delete set null,
  goal_general_place_id uuid references public.general_places(id) on delete set null,
  goal_name text not null,
  goal_latitude double precision not null,
  goal_longitude double precision not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  ended_reason text not null,
  is_partial boolean not null default false,
  distance_m double precision not null,
  duration_s integer not null,
  moving_duration_s integer not null,
  path_segments jsonb not null,
  point_count integer generated always as (private.ride_segment_point_count(path_segments)) stored,
  segment_count integer generated always as (jsonb_array_length(path_segments)) stored,
  source_version smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint ride_sessions_goal_name_check
    check (char_length(btrim(goal_name)) between 1 and 120),
  constraint ride_sessions_goal_coordinate_check
    check (goal_latitude between -90 and 90 and goal_longitude between -180 and 180),
  constraint ride_sessions_time_check
    check (ended_at >= started_at),
  constraint ride_sessions_ended_reason_check
    check (ended_reason in ('arrived', 'cancelled', 'interrupted')),
  constraint ride_sessions_metrics_check
    check (
      distance_m between 0 and 5000000
      and duration_s between 0 and 604800
      and moving_duration_s between 0 and duration_s
    ),
  constraint ride_sessions_target_check
    check (not (goal_place_id is not null and goal_general_place_id is not null)),
  constraint ride_sessions_path_check
    check (private.valid_ride_segments(path_segments))
);

comment on table public.ride_sessions is
  '사용자가 동의한 모토맵 실주행 길안내의 개인 비공개 실제 경로';
comment on column public.ride_sessions.path_segments is
  '끊김을 보존한 선분 배열. 각 점은 [longitude, latitude, elapsed_ms]';
comment on column public.ride_sessions.is_partial is
  'GPS 유실·앱 비활성화·강제 종료 등으로 실제 경로 일부만 남았는지 여부';

create index ride_sessions_user_started_idx
  on public.ride_sessions(user_id, started_at desc);
create index ride_sessions_consent_id_idx
  on public.ride_sessions(consent_id);
create index ride_sessions_user_bike_started_idx
  on public.ride_sessions(user_id, bike_id, started_at desc)
  where bike_id is not null;
create index ride_sessions_bike_id_idx
  on public.ride_sessions(bike_id)
  where bike_id is not null;
create index ride_sessions_goal_place_id_idx
  on public.ride_sessions(goal_place_id)
  where goal_place_id is not null;
create index ride_sessions_goal_general_place_id_idx
  on public.ride_sessions(goal_general_place_id)
  where goal_general_place_id is not null;

create or replace function private.enforce_ride_session_references()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ride_recording_consents consent
    where consent.id = new.consent_id
      and consent.user_id = new.user_id
      and consent.revoked_at is null
      and new.started_at >= consent.consented_at
      and new.started_at < consent.expires_at
  ) then
    raise exception 'ride session requires an active matching consent'
      using errcode = '23514';
  end if;

  if new.bike_id is not null and not exists (
    select 1
    from public.user_bikes bike
    where bike.id = new.bike_id
      and bike.user_id = new.user_id
  ) then
    raise exception 'ride session bike must belong to the same user'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ride_sessions_enforce_references
before insert or update on public.ride_sessions
for each row execute function private.enforce_ride_session_references();

alter table public.ride_sessions enable row level security;

create policy "ride_sessions_select_own"
on public.ride_sessions for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.ride_recording_consents consent
    where consent.id = consent_id
      and consent.revoked_at is null
      and consent.expires_at > statement_timestamp()
  )
);

create policy "ride_sessions_insert_own"
on public.ride_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "ride_sessions_delete_own"
on public.ride_sessions for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.ride_recording_consents consent
    where consent.id = consent_id
      and consent.revoked_at is null
      and consent.expires_at > statement_timestamp()
  )
);

revoke all on table public.ride_sessions from public, anon, authenticated;
grant select, insert, delete on table public.ride_sessions to authenticated;
grant all on table public.ride_sessions to service_role;

alter table public.place_rides
  add column ride_session_id uuid references public.ride_sessions(id) on delete set null;

create index place_rides_ride_session_idx
  on public.place_rides(ride_session_id)
  where ride_session_id is not null;

create or replace function private.enforce_place_ride_session_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ride_session_id is not null and not exists (
    select 1
    from public.ride_sessions session
    where session.id = new.ride_session_id
      and session.user_id = new.user_id
  ) then
    raise exception 'place ride session must belong to the same user'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger place_rides_enforce_session_owner
before insert or update of ride_session_id on public.place_rides
for each row execute function private.enforce_place_ride_session_owner();

revoke all on function private.ride_segment_point_count(jsonb)
  from public, anon, authenticated;
revoke all on function private.valid_ride_segments(jsonb)
  from public, anon, authenticated;
revoke all on function private.enforce_ride_session_references()
  from public, anon, authenticated;
revoke all on function private.enforce_place_ride_session_owner()
  from public, anon, authenticated;

-- 생성 열·CHECK 평가에는 삽입 역할의 실행 권한이 필요하다. private 스키마는
-- Data API에 노출되지 않으므로 이 순수 함수들이 RPC가 되지는 않는다.
grant execute on function private.ride_segment_point_count(jsonb)
  to authenticated, service_role;
grant execute on function private.valid_ride_segments(jsonb)
  to authenticated, service_role;
grant execute on function private.enforce_ride_session_references() to service_role;
grant execute on function private.enforce_place_ride_session_owner() to service_role;

create or replace function public.revoke_ride_recording_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.ride_recording_consents
  set revoked_at = statement_timestamp()
  where user_id = v_user_id
    and revoked_at is null;

  delete from public.ride_sessions
  where user_id = v_user_id;
end;
$$;

revoke all on function public.consent_ride_recording() from public, anon;
grant execute on function public.consent_ride_recording() to authenticated;
revoke all on function public.revoke_ride_recording_consent() from public, anon;
grant execute on function public.revoke_ride_recording_consent() to authenticated;

-- 동의 시점부터 최대 1년이 지나면 연결된 경로를 폐기한다. RLS도 만료 즉시 숨기며,
-- 이 작업은 5분마다 물리 행까지 정리한다.
create extension if not exists pg_cron;

select cron.schedule(
  'delete-expired-ride-sessions',
  '*/5 * * * *',
  $$
    delete from public.ride_sessions session
    using public.ride_recording_consents consent
    where session.consent_id = consent.id
      and (
        consent.expires_at <= now()
        or consent.revoked_at is not null
      )
  $$
);

-- 새 가입자는 현재 화면에 표시되는 문서 버전으로 기록한다. 기존 사용자의 과거 동의를
-- 소급해 바꾸지 않고, 경로 기록은 위의 기능별 별도 동의를 다시 받는다.
create or replace function public.complete_onboarding(p_nickname text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_accepted_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if char_length(v_nickname) < 2 or char_length(v_nickname) > 15 then
    raise exception 'nickname must be between 2 and 15 characters';
  end if;

  insert into public.profiles (id, nickname, onboarding_completed_at)
  values (v_user_id, v_nickname, v_accepted_at);

  insert into public.user_consents (
    user_id,
    terms_version,
    terms_accepted_at,
    privacy_version,
    privacy_accepted_at,
    location_version,
    location_accepted_at
  ) values (
    v_user_id,
    '2026-08-18',
    v_accepted_at,
    '2026-08-28',
    v_accepted_at,
    '2026-08-28',
    v_accepted_at
  );
end;
$$;
