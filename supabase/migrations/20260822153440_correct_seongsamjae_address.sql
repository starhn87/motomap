-- 운영자가 승인한 성삼재휴게소 행정동 교정을 적용하고, 최초 변경 감지 검토를
-- 같은 트랜잭션에서 완료한다. 외부 관찰값의 광역 명칭은 채택하지 않는다.

begin;

set local statement_timeout = '120s';

do $$
declare
  target_place public.places%rowtype;
  target_review public.place_change_reviews%rowtype;
  evidence_id uuid;
  verified_at timestamptz := now();
begin
  select *
  into target_place
  from public.places
  where id = '1e82e839-204d-401d-9c42-4e3b7a6bbe03'
  for update;

  if not found then
    raise exception '성삼재휴게소를 찾을 수 없습니다.';
  end if;

  if target_place.name <> '성삼재휴게소'
    or target_place.address <> '전남 구례군 광의면 노고단로 1068'
    or target_place.approved is not true
    or target_place.deleted_at is not null then
    raise exception '성삼재휴게소의 현재 상태가 감사 스냅샷과 다릅니다.';
  end if;

  select *
  into target_review
  from public.place_change_reviews
  where id = 'b992d31a-5b18-43f6-ae55-8bfc86f33f34'
    and place_id = target_place.id
  for update;

  if not found
    or target_review.status <> 'pending'
    or not (target_review.change_types @> array['address_changed']::text[])
    or target_review.observed_snapshot ->> 'address' not like '%산동면 노고단로 1068' then
    raise exception '성삼재휴게소 변경 검토 상태가 예상과 다릅니다.';
  end if;

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
    target_place.id,
    'manual_review',
    'identity_changed',
    'strong',
    '카카오맵 관찰값과 운영자 확인',
    target_review.observed_snapshot ->> 'place_url',
    'place-change-review:' || target_review.id::text,
    target_review.detected_at,
    jsonb_build_object(
      'review_id', target_review.id,
      'current_address', target_place.address,
      'observed_address', target_review.observed_snapshot ->> 'address',
      'approved_address', '전남 구례군 산동면 노고단로 1068',
      'decision', '행정동만 광의면에서 산동면으로 교정'
    ),
    'operator'
  )
  returning id into evidence_id;

  update public.places
  set
    address = '전남 구례군 산동면 노고단로 1068',
    last_verified_at = verified_at,
    next_verification_at = verified_at + interval '90 days'
  where id = target_place.id;

  insert into public.place_curation_actions (
    place_id,
    evidence_id,
    action_type,
    reason,
    previous_state,
    new_state,
    acted_by
  ) values (
    target_place.id,
    evidence_id,
    'update_details',
    '운영자가 성삼재휴게소의 행정동을 광의면에서 산동면으로 교정 승인함',
    jsonb_build_object('address', target_place.address),
    jsonb_build_object(
      'address', '전남 구례군 산동면 노고단로 1068',
      'last_verified_at', verified_at,
      'next_verification_at', verified_at + interval '90 days'
    ),
    'operator'
  );

  update public.place_change_reviews
  set
    status = 'resolved',
    reviewed_at = verified_at,
    resolution_note = '운영자 승인: 행정동을 광의면에서 산동면으로 교정'
  where id = target_review.id;

  update public.place_change_monitor_state
  set
    last_checked_at = verified_at,
    next_check_at = verified_at + interval '90 days',
    last_result = 'clean',
    last_error = null,
    consecutive_failures = 0,
    updated_at = verified_at
  where place_id = target_place.id;

  if not exists (
    select 1
    from public.places
    where id = target_place.id
      and address = '전남 구례군 산동면 노고단로 1068'
  ) or not exists (
    select 1
    from public.place_change_reviews
    where id = target_review.id
      and status = 'resolved'
      and reviewed_at = verified_at
  ) then
    raise exception '성삼재휴게소 교정 사후 검증에 실패했습니다.';
  end if;
end;
$$;

commit;
