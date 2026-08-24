-- 운영자 판단으로 카인드오브를 모토맵 등록 장소에서 제외하고 일반 장소로 전환한다.
-- 저장된 카카오 장소 식별자를 그대로 사용하며, 사전 점검 뒤 이용 기록이 생기면 전환을 중단한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  target public.places%rowtype;
  general_id uuid;
  created_evidence_id uuid;
  previous_state jsonb;
  evidence_reference constant text := 'operator-deregister-kindof-20260825:';
begin
  select place.*
  into strict target
  from public.places place
  where place.id = '8e7e8167-68e4-4aef-9791-c2bf91847c25'::uuid
  for update;

  if target.name <> '카인드오브'
     or target.address <> '전남광주통합특별시 북구 금남로 14-1'
     or target.phone is not null
     or target.category <> 'cafe'
     or target.approved is not true
     or target.deleted_at is not null
     or target.relevance_status <> 'review'
     or target.operational_status <> 'unknown'
     or target.is_curation_protected is not false
     or target.submitted_by is distinct from '28ce059b-4689-4109-aa05-dc2ea3f95011'::uuid
     or target.source_provider <> 'kakao'
     or target.source_place_id <> '22398696'
     or abs(public.st_y(target.location::public.geometry) - 35.1594880539472) > 0.000001
     or abs(public.st_x(target.location::public.geometry) - 126.897737591718) > 0.000001 then
    raise exception '카인드오브의 현재 상태가 검증 스냅샷과 다릅니다.';
  end if;

  if exists (
    select 1
    from public.general_places general
    where general.provider = 'kakao'
      and general.provider_place_id = '22398696'
  ) then
    raise exception '동일한 카카오 식별자의 일반 장소가 생겨 병합 검토가 필요합니다.';
  end if;

  if exists (
    select 1
    from public.reports report
    where report.target_type = 'place'
      and report.target_id = target.id
  ) then
    raise exception '일반 장소로 승계할 수 없는 장소 신고가 생겨 전환을 중단합니다.';
  end if;

  if exists (select 1 from public.reviews where place_id = target.id)
     or exists (select 1 from public.favorites where place_id = target.id)
     or exists (select 1 from public.place_rides where place_id = target.id)
     or exists (select 1 from public.place_rider_fact_votes where place_id = target.id)
     or exists (select 1 from public.riding_guide_stops where place_id = target.id)
     or exists (select 1 from public.riding_guide_submission_stops where place_id = target.id) then
    raise exception '사전 점검 뒤 이용 기록이 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.review_likes review_like
    join public.reviews review on review.id = review_like.review_id
    where review.place_id = target.id
  ) then
    raise exception '사전 점검 뒤 리뷰 좋아요가 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference = evidence_reference || target.id::text
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;

  previous_state := jsonb_build_object(
    'name', target.name,
    'address', target.address,
    'approved', target.approved,
    'deleted_at', target.deleted_at,
    'relevance_status', target.relevance_status,
    'operational_status', target.operational_status,
    'is_curation_protected', target.is_curation_protected,
    'last_verified_at', target.last_verified_at,
    'next_verification_at', target.next_verification_at,
    'source_provider', target.source_provider,
    'source_place_id', target.source_place_id
  );

  insert into public.general_places (
    provider,
    provider_place_id,
    name,
    address,
    latitude,
    longitude,
    phone,
    place_url,
    promoted_place_id
  ) values (
    'kakao',
    '22398696',
    '카인드오브',
    '전남광주통합특별시 북구 금남로 14-1',
    35.1594880539472,
    126.897737591718,
    null,
    'http://place.map.kakao.com/22398696',
    null
  )
  returning id into general_id;

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
    target.id,
    'manual_review',
    'relevance_rejected',
    'strong',
    '모토맵 운영자 최종 판단',
    evidence_reference || target.id::text,
    transaction_timestamp(),
    jsonb_build_object(
      'decision', '등록 장소에서 제외하고 저장된 카카오 식별자의 일반 장소로 전환',
      'general_place_identity', jsonb_build_object(
        'id', general_id,
        'provider', 'kakao',
        'provider_place_id', '22398696',
        'name', '카인드오브'
      ),
      'hard_delete', false,
      'preserved_reviews', 0,
      'preserved_favorites', 0,
      'preserved_rides', 0,
      'retained_rider_fact_votes', 0,
      'previous_state', previous_state
    ),
    'operator-review-20260825'
  )
  returning id into created_evidence_id;

  update public.places place
  set
    deleted_at = transaction_timestamp(),
    relevance_status = 'excluded',
    is_curation_protected = false,
    last_verified_at = transaction_timestamp(),
    next_verification_at = null
  where place.id = target.id
  returning place.* into target;

  insert into public.place_curation_actions (
    place_id,
    evidence_id,
    action_type,
    reason,
    previous_state,
    new_state,
    acted_by
  ) values (
    target.id,
    created_evidence_id,
    'soft_hide',
    '운영자 승인으로 등록 장소에서 제외하고 일반 장소로 전환함',
    previous_state,
    jsonb_build_object(
      'name', target.name,
      'address', target.address,
      'approved', target.approved,
      'deleted_at', target.deleted_at,
      'relevance_status', target.relevance_status,
      'operational_status', target.operational_status,
      'is_curation_protected', target.is_curation_protected,
      'last_verified_at', target.last_verified_at,
      'next_verification_at', target.next_verification_at,
      'general_place_id', general_id
    ),
    'operator-review-20260825'
  );

  if target.deleted_at is null
     or target.relevance_status <> 'excluded'
     or target.operational_status <> 'unknown'
     or target.is_curation_protected is not false then
    raise exception '카인드오브 등록 해제 상태 검증에 실패했습니다.';
  end if;

  if not exists (
    select 1
    from public.general_places general
    where general.id = general_id
      and general.provider = 'kakao'
      and general.provider_place_id = '22398696'
      and general.name = '카인드오브'
      and general.address = '전남광주통합특별시 북구 금남로 14-1'
      and general.phone is null
      and abs(general.latitude - 35.1594880539472) <= 0.000001
      and abs(general.longitude - 126.897737591718) <= 0.000001
      and general.place_url = 'http://place.map.kakao.com/22398696'
      and general.promoted_place_id is null
      and general.review_count = 0
      and general.rating = 0
      and general.share_count = 0
  ) then
    raise exception '카인드오브 일반 장소 상태 검증에 실패했습니다.';
  end if;

  if exists (select 1 from public.reviews where place_id = target.id)
     or exists (select 1 from public.favorites where place_id = target.id)
     or exists (select 1 from public.place_rides where place_id = target.id)
     or exists (select 1 from public.place_rider_fact_votes where place_id = target.id)
     or exists (select 1 from public.riding_guide_stops where place_id = target.id)
     or exists (select 1 from public.riding_guide_submission_stops where place_id = target.id) then
    raise exception '사전 검증에 없던 이용 기록이 대상 장소에 남았습니다.';
  end if;

  if (select count(*) from public.place_curation_evidence evidence
      where evidence.id = created_evidence_id) <> 1
     or (select count(*) from public.place_curation_actions action
         where action.evidence_id = created_evidence_id
           and action.place_id = target.id
           and action.action_type = 'soft_hide') <> 1 then
    raise exception '카인드오브 등록 해제 감사 이력 검증에 실패했습니다.';
  end if;
end
$$;

commit;
