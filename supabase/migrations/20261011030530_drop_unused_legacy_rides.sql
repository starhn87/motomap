-- RIDE-004: 현재 이용 목적이 없는 과거 GPS 경로 테이블만 제거한다.
-- 운영 적용은 별도 승인 후 수행하며 장소 방문·리뷰·즐겨찾기는 보존한다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

lock table public.rides in access exclusive mode;
do $guard$
begin
  -- 읽기 전용 사전 점검에서는 0행이었다. 새 데이터가 생겼다면 계획을 다시 확인한다.
  if exists (select 1 from public.rides) then
    raise exception 'Legacy ride rows changed; approval and aggregate review required';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.prepare_account_deletion(uuid)'::regprocedure
      and md5(prosrc) = '7f04a66af98dbb9dc07b96f2a82490e4'
      and not prosecdef
  ) then
    raise exception 'Account deletion function changed; review required';
  end if;
end;
$guard$;

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
  delete from public.place_change_reports where reporter_id = p_user_id;
  delete from public.place_rides where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.reports
  where reporter_id = p_user_id
     or (target_type = 'user' and target_id = p_user_id);
  delete from public.review_likes where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- CASCADE를 사용하지 않는다. 예상하지 못한 외부 의존성이 있으면 전체 트랜잭션을 중단한다.
drop table public.rides;

do $verify$
begin
  if to_regclass('public.rides') is not null then
    raise exception 'Legacy rides table still exists';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and (strpos(p.prosrc, 'public.rides') > 0 or strpos(p.prosrc, '"public"."rides"') > 0)
  ) then
    raise exception 'A function still references legacy rides';
  end if;
  if has_function_privilege('anon', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'Account deletion privileges do not match service-only access';
  end if;
end;
$verify$;
commit;
