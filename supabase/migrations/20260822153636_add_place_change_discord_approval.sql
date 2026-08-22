-- 변경 감지 보고에 사람이 승인할 정확한 패치를 저장하고, Discord 서명 검증을
-- 통과한 서비스 작업만 그 패치를 원자적으로 적용할 수 있게 한다.

begin;

set local statement_timeout = '120s';

alter table public.place_change_reviews
  add column proposed_changes jsonb not null default '{}'::jsonb,
  add constraint place_change_reviews_proposed_changes_check check (
    jsonb_typeof(proposed_changes) = 'object'
  );

comment on column public.place_change_reviews.proposed_changes is
  'Discord에 표시한 승인 대상 패치. 승인 시 이 값만 허용 목록과 현재 스냅샷을 검증해 적용한다.';

-- 기존 RPC를 유지해 Edge Function 배포 순서와 무관하게 감지가 계속 동작하도록 한다.
create function public.enqueue_place_change_review_v2(
  p_place_id uuid,
  p_fingerprint text,
  p_change_types text[],
  p_confidence text,
  p_source_provider text,
  p_current_snapshot jsonb,
  p_observed_snapshot jsonb,
  p_evidence jsonb,
  p_proposed_changes jsonb
)
returns table (
  review_id uuid,
  should_report boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.place_change_reviews%rowtype;
  inserted_id uuid;
begin
  if jsonb_typeof(coalesce(p_proposed_changes, '{}'::jsonb)) <> 'object' then
    raise exception '변경 계획은 JSON 객체여야 합니다.';
  end if;

  select *
  into existing
  from public.place_change_reviews review
  where review.place_id = p_place_id
    and review.fingerprint = p_fingerprint
  for update;

  if found then
    update public.place_change_reviews
    set
      last_seen_at = now(),
      proposed_changes = case
        when status = 'pending' and proposed_changes = '{}'::jsonb
          then coalesce(p_proposed_changes, '{}'::jsonb)
        else proposed_changes
      end
    where id = existing.id;

    return query
    select existing.id, existing.status = 'pending' and existing.reported_at is null;
    return;
  end if;

  insert into public.place_change_reviews (
    place_id,
    fingerprint,
    change_types,
    confidence,
    source_provider,
    current_snapshot,
    observed_snapshot,
    evidence,
    proposed_changes
  ) values (
    p_place_id,
    p_fingerprint,
    p_change_types,
    p_confidence,
    p_source_provider,
    p_current_snapshot,
    p_observed_snapshot,
    coalesce(p_evidence, '{}'::jsonb),
    coalesce(p_proposed_changes, '{}'::jsonb)
  )
  returning id into inserted_id;

  update public.place_change_reviews
  set status = 'superseded'
  where place_id = p_place_id
    and id <> inserted_id
    and status = 'pending';

  return query select inserted_id, true;
end;
$$;

revoke all on function public.enqueue_place_change_review_v2(
  uuid, text, text[], text, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_place_change_review_v2(
  uuid, text, text[], text, text, jsonb, jsonb, jsonb, jsonb
) to service_role;

create function public.resolve_place_change_review(
  p_review_id uuid,
  p_decision text,
  p_acted_by text
)
returns table (
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
  review_row public.place_change_reviews%rowtype;
  place_row public.places%rowtype;
  updated_place public.places%rowtype;
  evidence_id uuid;
  previous_state jsonb;
  next_state jsonb;
  proposal jsonb;
  actor text := btrim(coalesce(p_acted_by, ''));
  decided_at timestamptz := now();
  next_check timestamptz;
begin
  if p_decision not in ('apply', 'dismiss') then
    raise exception '지원하지 않는 검토 결정입니다.';
  end if;
  if char_length(actor) < 1 or char_length(actor) > 100 then
    raise exception '처리자 식별자가 올바르지 않습니다.';
  end if;

  select *
  into review_row
  from public.place_change_reviews review
  where review.id = p_review_id
  for update;

  if not found then
    raise exception '변경 검토를 찾을 수 없습니다.';
  end if;
  if review_row.status <> 'pending' then
    raise exception '이미 처리된 변경 검토입니다.';
  end if;

  select *
  into place_row
  from public.places place
  where place.id = review_row.place_id
  for update;

  if not found
    or place_row.approved is not true
    or place_row.deleted_at is not null then
    raise exception '활성 등록 장소를 찾을 수 없습니다.';
  end if;

  next_check := decided_at + case
    when place_row.is_curation_protected
      or place_row.category in ('viewpoint', 'rest_stop', 'camping')
      then interval '90 days'
    else interval '30 days'
  end;

  if p_decision = 'dismiss' then
    update public.place_change_reviews
    set
      status = 'dismissed',
      reviewed_at = decided_at,
      resolution_note = 'Discord 검토에서 변경 없음으로 종료 (' || actor || ')'
    where id = review_row.id;

    insert into public.place_change_monitor_state (
      place_id,
      last_checked_at,
      next_check_at,
      last_result,
      last_error,
      consecutive_failures,
      updated_at
    ) values (
      place_row.id,
      decided_at,
      next_check,
      'clean',
      null,
      0,
      decided_at
    )
    on conflict on constraint place_change_monitor_state_pkey do update
    set
      last_checked_at = excluded.last_checked_at,
      next_check_at = excluded.next_check_at,
      last_result = excluded.last_result,
      last_error = null,
      consecutive_failures = 0,
      updated_at = excluded.updated_at;

    return query
    select place_row.id, place_row.name, 'dismiss'::text, '{}'::jsonb;
    return;
  end if;

  proposal := review_row.proposed_changes;
  if proposal = '{}'::jsonb then
    raise exception '안전하게 자동 반영할 변경 계획이 없습니다.';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(proposal) as key(name)
    where key.name not in (
      'name',
      'address',
      'phone',
      'latitude',
      'longitude',
      'source_provider',
      'source_place_id'
    )
  ) then
    raise exception '허용되지 않은 변경 필드가 포함돼 있습니다.';
  end if;
  if (proposal ? 'latitude') <> (proposal ? 'longitude') then
    raise exception '좌표는 위도와 경도를 함께 변경해야 합니다.';
  end if;
  if (proposal ? 'source_provider') <> (proposal ? 'source_place_id') then
    raise exception '외부 공급자와 장소 ID를 함께 변경해야 합니다.';
  end if;
  if proposal ? 'name' and (
    jsonb_typeof(proposal -> 'name') <> 'string'
    or char_length(btrim(proposal ->> 'name')) not between 1 and 200
  ) then
    raise exception '변경할 장소명이 올바르지 않습니다.';
  end if;
  if proposal ? 'address' and (
    jsonb_typeof(proposal -> 'address') <> 'string'
    or char_length(btrim(proposal ->> 'address')) not between 1 and 500
  ) then
    raise exception '변경할 주소가 올바르지 않습니다.';
  end if;
  if proposal ? 'phone' and (
    jsonb_typeof(proposal -> 'phone') <> 'string'
    or char_length(btrim(proposal ->> 'phone')) not between 1 and 100
  ) then
    raise exception '변경할 전화번호가 올바르지 않습니다.';
  end if;
  if proposal ? 'latitude' and (
    jsonb_typeof(proposal -> 'latitude') <> 'number'
    or jsonb_typeof(proposal -> 'longitude') <> 'number'
    or (proposal ->> 'latitude')::double precision not between -90 and 90
    or (proposal ->> 'longitude')::double precision not between -180 and 180
  ) then
    raise exception '변경할 좌표가 올바르지 않습니다.';
  end if;
  if proposal ? 'source_provider' and (
    proposal ->> 'source_provider' <> 'kakao'
    or jsonb_typeof(proposal -> 'source_place_id') <> 'string'
    or char_length(btrim(proposal ->> 'source_place_id')) not between 1 and 200
  ) then
    raise exception '외부 장소 식별자가 올바르지 않습니다.';
  end if;

  -- 보고 뒤 다른 운영 작업이 개입했으면 오래된 계획을 적용하지 않는다.
  if (review_row.current_snapshot ->> 'name') is distinct from place_row.name
    or (review_row.current_snapshot ->> 'address') is distinct from place_row.address
    or (review_row.current_snapshot ->> 'phone') is distinct from place_row.phone
    or (review_row.current_snapshot ->> 'source_provider') is distinct from place_row.source_provider
    or (review_row.current_snapshot ->> 'source_place_id') is distinct from place_row.source_place_id
    or abs(
      (review_row.current_snapshot ->> 'latitude')::double precision
      - public.st_y(place_row.location::public.geometry)
    ) > 0.000000001
    or abs(
      (review_row.current_snapshot ->> 'longitude')::double precision
      - public.st_x(place_row.location::public.geometry)
    ) > 0.000000001 then
    raise exception '보고 이후 장소 정보가 바뀌어 계획을 적용하지 않았습니다.';
  end if;

  previous_state := jsonb_build_object(
    'name', place_row.name,
    'address', place_row.address,
    'phone', place_row.phone,
    'latitude', public.st_y(place_row.location::public.geometry),
    'longitude', public.st_x(place_row.location::public.geometry),
    'source_provider', place_row.source_provider,
    'source_place_id', place_row.source_place_id
  );

  update public.places
  set
    name = case when proposal ? 'name' then btrim(proposal ->> 'name') else name end,
    address = case when proposal ? 'address' then btrim(proposal ->> 'address') else address end,
    phone = case when proposal ? 'phone' then btrim(proposal ->> 'phone') else phone end,
    location = case
      when proposal ? 'latitude' then public.st_setsrid(
        public.st_makepoint(
          (proposal ->> 'longitude')::double precision,
          (proposal ->> 'latitude')::double precision
        ),
        4326
      )::public.geography
      else location
    end,
    source_provider = case
      when proposal ? 'source_provider' then proposal ->> 'source_provider'
      else source_provider
    end,
    source_place_id = case
      when proposal ? 'source_place_id' then btrim(proposal ->> 'source_place_id')
      else source_place_id
    end,
    last_verified_at = decided_at,
    next_verification_at = next_check
  where id = place_row.id
  returning * into updated_place;

  next_state := jsonb_build_object(
    'name', updated_place.name,
    'address', updated_place.address,
    'phone', updated_place.phone,
    'latitude', public.st_y(updated_place.location::public.geometry),
    'longitude', public.st_x(updated_place.location::public.geometry),
    'source_provider', updated_place.source_provider,
    'source_place_id', updated_place.source_place_id
  );

  insert into public.place_curation_evidence (
    place_id,
    source_type,
    signal,
    strength,
    source_name,
    source_url,
    source_reference,
    observed_at,
    details,
    recorded_by
  ) values (
    place_row.id,
    'map_provider',
    'identity_changed',
    case review_row.confidence
      when 'high' then 'strong'
      when 'medium' then 'medium'
      else 'weak'
    end,
    '카카오맵 장소 변경 감지',
    review_row.observed_snapshot ->> 'place_url',
    'place-change-review:' || review_row.id::text || ':approval',
    review_row.detected_at,
    jsonb_build_object(
      'review_id', review_row.id,
      'change_types', review_row.change_types,
      'current_snapshot', review_row.current_snapshot,
      'observed_snapshot', review_row.observed_snapshot,
      'approved_changes', proposal
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
    case
      when proposal ?| array[
        'name',
        'address',
        'latitude',
        'longitude',
        'source_provider',
        'source_place_id'
      ] then 'update_identity'
      else 'update_details'
    end,
    'Discord에 표시된 장소 변경 계획을 운영자가 승인함',
    previous_state,
    next_state,
    actor
  );

  update public.place_change_reviews
  set
    status = 'resolved',
    reviewed_at = decided_at,
    resolution_note = 'Discord에서 계획대로 반영 승인 (' || actor || ')'
  where id = review_row.id;

  insert into public.place_change_monitor_state (
    place_id,
    last_checked_at,
    next_check_at,
    last_result,
    last_error,
    consecutive_failures,
    updated_at
  ) values (
    place_row.id,
    decided_at,
    next_check,
    'clean',
    null,
    0,
    decided_at
  )
  on conflict on constraint place_change_monitor_state_pkey do update
  set
    last_checked_at = excluded.last_checked_at,
    next_check_at = excluded.next_check_at,
    last_result = excluded.last_result,
    last_error = null,
    consecutive_failures = 0,
    updated_at = excluded.updated_at;

  return query
  select updated_place.id, updated_place.name, 'apply'::text, proposal;
end;
$$;

revoke all on function public.resolve_place_change_review(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_place_change_review(uuid, text, text)
  to service_role;

commit;
