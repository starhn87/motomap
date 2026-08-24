-- 위험 정보는 유형에 따라 실제 지속 시간이 크게 다르다. 짧은 신선도 기간에는
-- 길안내 경고까지 제공하고, 그 뒤에는 흐리게 남겨 재확인을 유도한 다음 만료한다.
create or replace function public.hazard_fresh_interval(hazard_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case hazard_type
    when 'ice' then interval '6 hours'
    when 'oil' then interval '1 day'
    when 'sand' then interval '3 days'
    when 'rockfall' then interval '7 days'
    when 'construction' then interval '7 days'
    when 'pothole' then interval '14 days'
    else interval '1 day'
  end;
$$;

create or replace function public.hazard_expire_interval(hazard_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case hazard_type
    when 'ice' then interval '24 hours'
    when 'oil' then interval '3 days'
    when 'sand' then interval '10 days'
    when 'rockfall' then interval '21 days'
    when 'construction' then interval '30 days'
    when 'pothole' then interval '60 days'
    else interval '7 days'
  end;
$$;

revoke all on function public.hazard_fresh_interval(text) from public;
revoke all on function public.hazard_expire_interval(text) from public;
grant execute on function public.hazard_fresh_interval(text) to anon, authenticated, service_role;
grant execute on function public.hazard_expire_interval(text) to anon, authenticated, service_role;

alter table public.road_hazards
  add column if not exists last_resolved_at timestamp with time zone;

comment on column public.road_hazards.last_resolved_at is
  '마지막 확인 이후 들어온 가장 최근 없어짐 표 시각. 확인 표가 들어오면 null로 초기화한다.';

-- security_invoker 뷰가 호출자 권한으로 해제 유예 조건을 평가하는 데 필요하다.
grant select (last_resolved_at) on public.road_hazards to anon, authenticated;

-- 최초 제보를 제보자의 첫 현장 확인으로 기록한다. 이미 의견을 바꾼 제보자는
-- 현재 표를 유지하고, 표가 없는 기존 제보만 생성 시각의 확인 표로 보정한다.
insert into public.hazard_votes (hazard_id, user_id, kind, created_at)
select h.id, h.reported_by, 'confirm', h.created_at
from public.road_hazards h
where h.reported_by is not null
  and h.deleted_at is null
on conflict (hazard_id, user_id) do nothing;

create or replace function private.initialize_hazard_reporter_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reported_by is null then
    return new;
  end if;

  insert into public.hazard_votes (hazard_id, user_id, kind, created_at)
  values (new.id, new.reported_by, 'confirm', new.created_at)
  on conflict (hazard_id, user_id) do nothing;

  update public.road_hazards h
  set confirm_count = (
    select count(*)::integer
    from public.hazard_votes v
    where v.hazard_id = new.id and v.kind = 'confirm'
  )
  where h.id = new.id;

  return new;
end;
$$;

revoke all on function private.initialize_hazard_reporter_vote() from public, anon, authenticated;

drop trigger if exists road_hazards_initialize_reporter_vote on public.road_hazards;
create trigger road_hazards_initialize_reporter_vote
after insert on public.road_hazards
for each row execute function private.initialize_hazard_reporter_vote();

-- 기존 표도 마지막 확인 이후의 해제 의견만 현재 판단에 반영한다.
update public.road_hazards h
set
  confirm_count = (
    select count(*)::integer
    from public.hazard_votes v
    where v.hazard_id = h.id and v.kind = 'confirm'
  ),
  resolved_count = (
    select count(*)::integer
    from public.hazard_votes v
    where v.hazard_id = h.id
      and v.kind = 'resolve'
      and v.created_at >= h.last_confirmed_at
  ),
  last_resolved_at = (
    select max(v.created_at)
    from public.hazard_votes v
    where v.hazard_id = h.id
      and v.kind = 'resolve'
      and v.created_at >= h.last_confirmed_at
  );

-- 한 사람 한 표는 유지하되 같은 사용자의 새 현장 확인은 시간을 다시 갱신한다.
-- 확인은 이전 해제 의견을 무효화하고, 해제는 마지막 확인 이후의 표만 센다.
create or replace function public.vote_hazard(p_hazard_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  previous_kind text;
  previous_at timestamp with time zone;
  confirmed_at timestamp with time zone;
  voted_at timestamp with time zone := clock_timestamp();
  reporter_id uuid;
  reported_at timestamp with time zone;
begin
  if caller_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_kind not in ('confirm', 'resolve') then
    raise exception '잘못된 값입니다.';
  end if;

  select h.last_confirmed_at, h.reported_by, h.created_at
  into confirmed_at, reporter_id, reported_at
  from public.road_hazards h
  where h.id = p_hazard_id
    and h.deleted_at is null
  for update;

  if not found then
    raise exception '위험 정보를 찾을 수 없습니다.';
  end if;

  select v.kind, v.created_at
  into previous_kind, previous_at
  from public.hazard_votes v
  where v.hazard_id = p_hazard_id
    and v.user_id = caller_id;

  -- 최초 제보를 잘못했거나 위험이 빠르게 사라진 경우에는 제보자가 바로 해제할 수 있다.
  -- 그 외에는 한 사람이 혼자 상태를 반복 전환하거나 수명을 갱신하지 못하게 제한한다.
  if previous_at is not null
     and voted_at < previous_at + interval '6 hours'
     and not (
       caller_id = reporter_id
       and p_kind = 'resolve'
       and previous_kind = 'confirm'
       and previous_at = reported_at
     ) then
    raise exception '같은 위험 정보는 마지막 판단 6시간 후 다시 확인할 수 있어요.';
  end if;

  -- 이미 마지막 확인 이후에 해제 표를 냈다면 같은 표를 중복 집계하지 않는다.
  if p_kind = 'resolve'
     and previous_kind = 'resolve'
     and previous_at >= confirmed_at then
    return;
  end if;

  insert into public.hazard_votes (hazard_id, user_id, kind, created_at)
  values (p_hazard_id, caller_id, p_kind, voted_at)
  on conflict (hazard_id, user_id)
  do update set kind = excluded.kind, created_at = excluded.created_at;

  if p_kind = 'confirm' then
    update public.road_hazards
    set
      confirm_count = confirm_count + case when previous_kind = 'confirm' then 0 else 1 end,
      last_confirmed_at = voted_at,
      resolved_count = 0,
      last_resolved_at = null
    where id = p_hazard_id;
  else
    update public.road_hazards
    set
      confirm_count = greatest(
        confirm_count - case when previous_kind = 'confirm' then 1 else 0 end,
        0
      ),
      resolved_count = resolved_count + 1,
      last_resolved_at = voted_at
    where id = p_hazard_id;
  end if;
end;
$$;

revoke all on function public.vote_hazard(uuid, text) from public, anon;
grant execute on function public.vote_hazard(uuid, text) to authenticated, service_role;

drop policy if exists "road_hazards 조회는 제보자만" on public.road_hazards;
drop policy if exists "road_hazards 공개 정보 조회" on public.road_hazards;
create policy "road_hazards 공개 정보 조회" on public.road_hazards
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and last_confirmed_at > now() - public.hazard_expire_interval(type)
    and not (
      resolved_count >= 2
      or (
        resolved_count >= 1
        and coalesce(last_resolved_at, '-infinity'::timestamp with time zone)
          <= now() - interval '24 hours'
      )
    )
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
      when h.resolved_count > 0
        or h.last_confirmed_at <= now() - public.hazard_fresh_interval(h.type)
      then 1 else 0
    end as staleness
  from public.road_hazards h
  where h.deleted_at is null
    and h.last_confirmed_at > now() - public.hazard_expire_interval(h.type)
    and not (
      h.resolved_count >= 2
      or (
        h.resolved_count >= 1
        and coalesce(h.last_resolved_at, '-infinity'::timestamp with time zone)
          <= now() - interval '24 hours'
      )
    );

revoke all on public.live_road_hazards from public;
grant select on public.live_road_hazards to anon, authenticated, service_role;

-- 계정 삭제로 표가 사라지면 남은 표 중 현재 확인보다 새로운 해제 의견만 재집계한다.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  update public.reviews
  set user_id = null, user_name = '탈퇴한 사용자', photos = '{}'::text[]
  where user_id = p_user_id;

  update public.course_reviews
  set user_id = null, user_name = '탈퇴한 사용자'
  where user_id = p_user_id;

  update public.places set submitted_by = null where submitted_by = p_user_id;
  update public.courses set created_by = null where created_by = p_user_id;
  update public.road_hazards
  set reported_by = null, photo = null
  where reported_by = p_user_id;

  with deleted_votes as (
    delete from public.hazard_votes
    where user_id = p_user_id
    returning hazard_id
  )
  update public.road_hazards h
  set
    confirm_count = (
      select count(*)::integer
      from public.hazard_votes v
      where v.hazard_id = h.id and v.kind = 'confirm'
    ),
    resolved_count = (
      select count(*)::integer
      from public.hazard_votes v
      where v.hazard_id = h.id
        and v.kind = 'resolve'
        and v.created_at >= h.last_confirmed_at
    ),
    last_resolved_at = (
      select max(v.created_at)
      from public.hazard_votes v
      where v.hazard_id = h.id
        and v.kind = 'resolve'
        and v.created_at >= h.last_confirmed_at
    )
  where h.id in (select hazard_id from deleted_votes);

  delete from public.blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  delete from public.favorites where user_id = p_user_id;
  delete from public.feedback where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.place_rides where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.reports
  where reporter_id = p_user_id
     or (target_type = 'user' and target_id = p_user_id);
  delete from public.review_likes where user_id = p_user_id;
  delete from public.rides where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- 일 단위만 표현하던 구 정책 함수는 새 간격 함수로 완전히 대체한다.
drop function if exists public.hazard_fresh_days(text);
