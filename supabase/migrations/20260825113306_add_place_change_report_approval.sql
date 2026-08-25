-- 사용자 장소 변경 제보를 Discord 운영자 승인과 실제 장소 상태에 안전하게 연결한다.
alter table public.place_change_reports
  drop constraint place_change_reports_reason_check,
  add constraint place_change_reports_reason_check check (
    reason in (
      'permanently_closed',
      'temporarily_closed',
      'reopened',
      'moved',
      'business_info_changed',
      'other'
    )
  ),
  add column reported_place_snapshot jsonb not null default '{}'::jsonb,
  add constraint place_change_reports_snapshot_check check (
    jsonb_typeof(reported_place_snapshot) = 'object'
  );

comment on column public.place_change_reports.reported_place_snapshot is
  '제보 당시 장소명·주소·전화·운영 상태. Discord 승인 전에 장소가 바뀌지 않았는지 재검증한다.';

comment on table public.place_change_reports is
  '사용자가 등록 장소의 폐업·휴업·영업 재개·이전·정보 변경을 알리는 검토 대기열. 운영자 승인 전에는 장소를 변경하지 않는다.';

-- 기존 장소 RPC 계약을 바꾸지 않고 운영 상태만 추가 조회한다. 호출자의 places RLS를
-- 그대로 적용하므로 숨긴 장소와 미승인 장소는 반환되지 않는다.
create or replace function public.active_place_operational_statuses()
returns table(place_id uuid, operational_status text)
language sql
stable
security invoker
set search_path = ''
as $$
  select place.id, place.operational_status
  from public.places place
  where place.approved is true
    and place.deleted_at is null;
$$;

revoke all on function public.active_place_operational_statuses()
  from public, anon, authenticated, service_role;
grant execute on function public.active_place_operational_statuses()
  to anon, authenticated, service_role;

-- Discord 서명 검증을 통과한 Edge Function만 호출한다. 자유서술형 상호·주소·전화
-- 변경은 이 함수가 추측해 반영하지 않고, 기존 고정 계획 승인 파이프라인을 사용한다.
create or replace function public.resolve_place_change_report(
  p_report_id uuid,
  p_decision text,
  p_acted_by text
)
returns table(
  place_id uuid,
  place_name text,
  decision text,
  applied_changes jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.place_change_reports%rowtype;
  place_row public.places%rowtype;
  evidence_id uuid;
  actor text := btrim(coalesce(p_acted_by, ''));
  decided_at timestamptz := now();
  desired_status text;
  hide_place boolean := false;
  next_check timestamptz;
  previous_state jsonb;
  next_state jsonb;
begin
  if p_decision not in (
    'dismiss',
    'mark_temporarily_closed',
    'mark_operational',
    'hide_permanently_closed',
    'hide_moved'
  ) then
    raise exception '지원하지 않는 사용자 장소 제보 결정입니다.';
  end if;
  if char_length(actor) < 1 or char_length(actor) > 100 then
    raise exception '처리자 식별자가 올바르지 않습니다.';
  end if;

  select report.*
  into report_row
  from public.place_change_reports report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception '장소 정보 제보를 찾을 수 없습니다.';
  end if;
  if report_row.status <> 'pending' then
    raise exception '이미 처리된 장소 정보 제보입니다.';
  end if;

  select place.*
  into place_row
  from public.places place
  where place.id = report_row.place_id
  for update;

  if not found then
    raise exception '제보 대상 장소를 찾을 수 없습니다.';
  end if;

  if p_decision = 'dismiss' then
    update public.place_change_reports report
    set
      status = 'dismissed',
      resolved_at = decided_at,
      resolution_note = 'Discord 검토에서 변경 없음으로 종료 (' || actor || ')'
    where report.id = report_row.id;

    return query
    select place_row.id, place_row.name, p_decision, '{}'::jsonb;
    return;
  end if;

  if place_row.approved is not true or place_row.deleted_at is not null then
    raise exception '활성 등록 장소만 운영 상태를 반영할 수 있습니다.';
  end if;
  if report_row.reported_place_snapshot = '{}'::jsonb then
    raise exception '제보 당시 장소 정보가 없어 자동 반영할 수 없습니다.';
  end if;
  if (report_row.reported_place_snapshot ->> 'name') is distinct from place_row.name
    or (report_row.reported_place_snapshot ->> 'address') is distinct from place_row.address
    or (report_row.reported_place_snapshot ->> 'phone') is distinct from place_row.phone
    or (report_row.reported_place_snapshot ->> 'operational_status')
      is distinct from place_row.operational_status then
    raise exception '제보 이후 장소 정보가 바뀌어 자동 반영하지 않았습니다.';
  end if;

  case report_row.reason
    when 'temporarily_closed' then
      if p_decision <> 'mark_temporarily_closed' then
        raise exception '임시 휴업 제보에 맞지 않는 결정입니다.';
      end if;
      desired_status := 'temporarily_closed';
      next_check := decided_at + interval '14 days';
    when 'reopened' then
      if p_decision <> 'mark_operational' then
        raise exception '영업 재개 제보에 맞지 않는 결정입니다.';
      end if;
      if place_row.operational_status <> 'temporarily_closed' then
        raise exception '임시 휴업 중인 장소만 영업 재개로 바꿀 수 있습니다.';
      end if;
      desired_status := 'operational';
      next_check := decided_at + case
        when place_row.is_curation_protected
          or place_row.category in ('viewpoint', 'rest_stop', 'camping')
          then interval '90 days'
        else interval '30 days'
      end;
    when 'permanently_closed' then
      if p_decision <> 'hide_permanently_closed' then
        raise exception '폐업 제보에 맞지 않는 결정입니다.';
      end if;
      desired_status := 'permanently_closed';
      hide_place := true;
      next_check := null;
    when 'moved' then
      if p_decision <> 'hide_moved' then
        raise exception '이전 제보에 맞지 않는 결정입니다.';
      end if;
      desired_status := 'moved';
      hide_place := true;
      next_check := null;
    else
      raise exception '자유서술형 정보 변경은 고정 계획 없이 자동 반영할 수 없습니다.';
  end case;

  previous_state := jsonb_build_object(
    'operational_status', place_row.operational_status,
    'deleted_at', place_row.deleted_at,
    'last_verified_at', place_row.last_verified_at,
    'next_verification_at', place_row.next_verification_at
  );

  update public.places place
  set
    operational_status = desired_status,
    deleted_at = case when hide_place then decided_at else place.deleted_at end,
    last_verified_at = decided_at,
    next_verification_at = next_check
  where place.id = place_row.id
  returning jsonb_build_object(
    'operational_status', place.operational_status,
    'deleted_at', place.deleted_at,
    'last_verified_at', place.last_verified_at,
    'next_verification_at', place.next_verification_at
  ) into next_state;

  insert into public.place_curation_evidence (
    place_id,
    source_type,
    signal,
    strength,
    source_name,
    source_reference,
    observed_at,
    details,
    recorded_by
  ) values (
    place_row.id,
    'manual_review',
    desired_status,
    'strong',
    'Discord 운영자 승인 사용자 제보',
    'place-change-report:' || report_row.id::text,
    report_row.created_at,
    jsonb_build_object(
      'report_id', report_row.id,
      'reason', report_row.reason,
      'description', report_row.description,
      'reported_place_snapshot', report_row.reported_place_snapshot
    ),
    actor
  )
  returning id into evidence_id;

  insert into public.place_curation_actions (
    place_id,
    evidence_id,
    action_type,
    reason,
    previous_state,
    new_state,
    acted_by
  ) values (
    place_row.id,
    evidence_id,
    case when hide_place then 'soft_hide' else 'set_operational_status' end,
    case report_row.reason
      when 'temporarily_closed' then '사용자 임시 휴업 제보를 운영자가 확인함'
      when 'reopened' then '사용자 영업 재개 제보를 운영자가 확인함'
      when 'permanently_closed' then '사용자 폐업 제보를 운영자가 확인함'
      when 'moved' then '사용자 이전 제보를 운영자가 확인해 기존 위치를 숨김'
    end,
    previous_state,
    next_state,
    actor
  );

  update public.place_change_reports report
  set
    status = 'resolved',
    resolved_at = decided_at,
    resolution_note = 'Discord에서 운영 상태 반영 승인 (' || actor || ')'
  where report.id = report_row.id;

  return query
  select
    place_row.id,
    place_row.name,
    p_decision,
    next_state - 'last_verified_at' - 'next_verification_at';
end;
$$;

revoke all on function public.resolve_place_change_report(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_place_change_report(uuid, text, text)
  to service_role;
