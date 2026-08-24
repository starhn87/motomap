-- 최초 제보는 위험의 수명 시작점일 뿐 명시적인 '아직 있어요' 확인 표가 아니다.
-- 직전 마이그레이션이 만든 자동 표만 정확히 제거하고 이후 자동 생성도 중단한다.
drop trigger if exists road_hazards_initialize_reporter_vote on public.road_hazards;
drop function if exists private.initialize_hazard_reporter_vote();

delete from public.hazard_votes v
using public.road_hazards h
where v.hazard_id = h.id
  and v.user_id = h.reported_by
  and v.kind = 'confirm'
  and v.created_at = h.created_at;

update public.road_hazards h
set confirm_count = (
  select count(*)::integer
  from public.hazard_votes v
  where v.hazard_id = h.id and v.kind = 'confirm'
);

-- 사용자의 실제 표만 6시간 재판단 제한의 기준으로 삼는다. 제보자는 잘못된 제보를
-- 바로 정정할 수 있지만, 자기 제보를 확인 표로 만들려면 6시간 뒤 다시 확인해야 한다.
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

  if previous_at is not null
     and voted_at < previous_at + interval '6 hours' then
    raise exception '같은 위험 정보는 마지막 판단 6시간 후 다시 확인할 수 있어요.';
  end if;

  if previous_at is null
     and caller_id = reporter_id
     and p_kind = 'confirm'
     and voted_at < reported_at + interval '6 hours' then
    raise exception '제보자는 제보 6시간 후부터 다시 확인할 수 있어요.';
  end if;

  -- 마지막 확인 이후의 같은 해제 표는 6시간이 지나도 중복 집계하지 않는다.
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
