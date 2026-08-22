-- 운영자가 직접 확인한 7개 장소만 원자적으로 교정하거나 소프트 숨김한다.
-- 이름·주소가 바뀐 동일 장소는 UUID를 유지해 리뷰·즐겨찾기·주행 이력을 보존한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  target_ids constant uuid[] := array[
    '004cf50b-b141-43d1-89ea-2d24cd5655bc'::uuid,
    '45877d0d-b367-4cb6-a638-3c53af86a8cc'::uuid,
    '5c86fce3-4d39-46ef-91e0-d262e9fb4235'::uuid,
    'c0f614bf-9902-4b03-ad41-ce7ad1bec892'::uuid,
    'eab49697-79c2-4259-a203-e43bbc66318e'::uuid,
    'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf'::uuid,
    'f7f731e4-afd8-4072-8210-680919c7069d'::uuid
  ];
begin
  -- 다른 운영 작업과 충돌하지 않도록 UUID 순서로 대상 행만 잠근다.
  perform p.id
  from public.places p
  where p.id = any(target_ids)
  order by p.id
  for update;

  if (select count(*) from public.places p where p.id = any(target_ids)) <> 7 then
    raise exception '장소 큐레이션 대상 7개를 모두 찾지 못했습니다.';
  end if;

  if exists (
    select 1
    from (
      values
        ('004cf50b-b141-43d1-89ea-2d24cd5655bc'::uuid, '비엔비(B&B)', '부산 강서구 강동동 2279', 'verified'),
        ('45877d0d-b367-4cb6-a638-3c53af86a8cc'::uuid, '돈키호테 1988', '경남 밀양시 삼랑진읍 천태로 98 102호', 'verified'),
        ('5c86fce3-4d39-46ef-91e0-d262e9fb4235'::uuid, '죽령주막', '경북 영주시 풍기읍 죽령로 2136', 'review'),
        ('c0f614bf-9902-4b03-ad41-ce7ad1bec892'::uuid, '루트세븐 레저타운', '경북 포항시 북구 송라면 동해대로 3166', 'verified'),
        ('eab49697-79c2-4259-a203-e43bbc66318e'::uuid, '바이크마트 청주점', '충북 청주시 청원구 중앙로256번길 9', 'verified'),
        ('f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf'::uuid, '필립상회 & 카페 1.14km', '대구 중구 북성로 59-1', 'verified'),
        ('f7f731e4-afd8-4072-8210-680919c7069d'::uuid, '라이더카페더블유', '경기 남양주시 화도읍 북한강로 1673', 'verified')
    ) expected(id, name, address, relevance_status)
    left join public.places p on p.id = expected.id
    where p.name is distinct from expected.name
       or p.address is distinct from expected.address
       or p.relevance_status is distinct from expected.relevance_status
       or p.approved is distinct from true
       or p.deleted_at is not null
       or p.is_curation_protected is distinct from false
       or p.source_provider is not null
       or p.source_place_id is not null
  ) then
    raise exception '대상 장소의 현재 상태가 감사 시점과 달라 반영을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.places p
    where p.deleted_at is null
      and p.id <> all(target_ids)
      and p.source_provider = 'kakao'
      and p.source_place_id in ('1049956456', '1253122948', '469181103')
  ) then
    raise exception '교정할 카카오 장소 식별자가 다른 활성 장소와 충돌합니다.';
  end if;

  -- 승격 트리거가 다른 사용자 기록을 함께 옮기는 상황은 이번 7행 한정 작업에서 허용하지 않는다.
  if exists (
    select 1
    from public.general_places gp
    where gp.provider = 'kakao'
      and gp.provider_place_id in ('1049956456', '1253122948', '469181103')
  ) then
    raise exception '교정할 카카오 장소 식별자가 일반 장소 기록과 충돌합니다.';
  end if;
end
$$;

create temporary table operator_place_decisions_20260822_before
on commit drop
as
select
  p.id,
  jsonb_build_object(
    'name', p.name,
    'description', p.description,
    'category', p.category,
    'latitude', public.st_y(p.location::public.geometry),
    'longitude', public.st_x(p.location::public.geometry),
    'address', p.address,
    'phone', p.phone,
    'tags', p.tags,
    'opening_hours', p.opening_hours,
    'hours', p.hours,
    'parking_info', p.parking_info,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'source_provider', p.source_provider,
    'source_place_id', p.source_place_id,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'is_curation_protected', p.is_curation_protected,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ) as previous_state
from public.places p
where p.id in (
  '004cf50b-b141-43d1-89ea-2d24cd5655bc',
  '45877d0d-b367-4cb6-a638-3c53af86a8cc',
  '5c86fce3-4d39-46ef-91e0-d262e9fb4235',
  'c0f614bf-9902-4b03-ad41-ce7ad1bec892',
  'eab49697-79c2-4259-a203-e43bbc66318e',
  'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf',
  'f7f731e4-afd8-4072-8210-680919c7069d'
);

-- 운영자의 최종 판단을 각 장소의 주 근거로 기록한다.
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
)
select
  decision.place_id,
  'manual_review',
  decision.signal,
  decision.strength,
  '모토맵 운영자 직접 검증',
  decision.source_reference,
  '2026-08-22T02:00:00.000Z'::timestamptz,
  decision.details || jsonb_build_object('previous_state', before.previous_state),
  'operator-review-20260822'
from (
  values
    (
      'f7f731e4-afd8-4072-8210-680919c7069d'::uuid,
      'permanently_closed',
      'strong',
      'operator-decision-20260822:rider-cafe-w-closed',
      jsonb_build_object('decision', '폐업 확정 후 소프트 숨김', 'hard_delete', false)
    ),
    (
      'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf'::uuid,
      'not_found',
      'medium',
      'operator-decision-20260822:philip-hide',
      jsonb_build_object('decision', '현행 지도 검색에서 확인되지 않아 우선 소프트 숨김', 'closure_confirmed', false)
    ),
    (
      '5c86fce3-4d39-46ef-91e0-d262e9fb4235'::uuid,
      'unknown',
      'strong',
      'operator-decision-20260822:jukryeong-hide',
      jsonb_build_object('decision', '운영 상태를 단정하지 않고 소프트 숨김', 'closure_confirmed', false)
    ),
    (
      '45877d0d-b367-4cb6-a638-3c53af86a8cc'::uuid,
      'identity_changed',
      'strong',
      'operator-decision-20260822:donquixote-to-dodoikku',
      jsonb_build_object('decision', '동일 주소의 도도이꾸로 기존 행 교정', 'preserve_place_id', true)
    ),
    (
      'c0f614bf-9902-4b03-ad41-ce7ad1bec892'::uuid,
      'moved',
      'strong',
      'operator-decision-20260822:route-seven-address',
      jsonb_build_object('decision', '현행 주소 동해대로 2829로 기존 행 교정', 'preserve_place_id', true)
    ),
    (
      '004cf50b-b141-43d1-89ea-2d24cd5655bc'::uuid,
      'not_found',
      'medium',
      'operator-decision-20260822:bnb-hide',
      jsonb_build_object('decision', '현행 지도 검색에서 확인되지 않아 우선 소프트 숨김', 'closure_confirmed', false, 'preserve_favorites', true)
    ),
    (
      'eab49697-79c2-4259-a203-e43bbc66318e'::uuid,
      'identity_changed',
      'strong',
      'operator-decision-20260822:bikemart-to-conquer',
      jsonb_build_object('decision', '동일 영업점의 CONQUER 청주점 리브랜딩·이전 교정', 'preserve_place_id', true)
    )
) decision(place_id, signal, strength, source_reference, details)
join operator_place_decisions_20260822_before before on before.id = decision.place_id;

-- 동일 장소 교정에 사용한 외부 식별 근거를 별도로 보존한다.
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
)
values
  (
    '45877d0d-b367-4cb6-a638-3c53af86a8cc',
    'map_provider',
    'identity_changed',
    'medium',
    '카카오 로컬',
    'http://place.map.kakao.com/1049956456',
    'operator-decision-20260822:kakao:1049956456',
    '2026-08-22T02:00:00.000Z',
    jsonb_build_object(
      'matched_name', '도도이꾸',
      'matched_address', '경남 밀양시 삼랑진읍 천태로 98',
      'provider_place_id', '1049956456',
      'latitude', 35.4005019388143,
      'longitude', 128.845067018604
    ),
    'operator-review-20260822'
  ),
  (
    'c0f614bf-9902-4b03-ad41-ce7ad1bec892',
    'map_provider',
    'moved',
    'medium',
    '카카오 로컬',
    'http://place.map.kakao.com/1253122948',
    'operator-decision-20260822:kakao:1253122948',
    '2026-08-22T02:00:00.000Z',
    jsonb_build_object(
      'matched_name', '루트7레저타운',
      'matched_address', '경북 포항시 북구 송라면 동해대로 2829',
      'matched_phone', '054-255-5882',
      'provider_place_id', '1253122948',
      'latitude', 36.2185440671356,
      'longitude', 129.35419681207
    ),
    'operator-review-20260822'
  ),
  (
    'eab49697-79c2-4259-a203-e43bbc66318e',
    'official_website',
    'identity_changed',
    'strong',
    'CONQUER 공식 판매처',
    'https://conquer-korea.com/shop_map_search/',
    'operator-decision-20260822:conquer-official-cheongju',
    '2026-08-22T02:00:00.000Z',
    jsonb_build_object(
      'listed_name', 'CONQUER 청주점',
      'listed_address', '충북 청주시 청원구 무심동로 744',
      'listed_phone', '0507-1484-9803'
    ),
    'operator-review-20260822'
  ),
  (
    'eab49697-79c2-4259-a203-e43bbc66318e',
    'map_provider',
    'moved',
    'medium',
    '카카오 로컬',
    'http://place.map.kakao.com/469181103',
    'operator-decision-20260822:kakao:469181103',
    '2026-08-22T02:00:00.000Z',
    jsonb_build_object(
      'matched_name', '바이크마트 청주카페점',
      'matched_address', '충북 청주시 청원구 무심동로 744',
      'matched_phone', '0507-1484-9803',
      'provider_place_id', '469181103',
      'latitude', 36.664119731886,
      'longitude', 127.469493109112
    ),
    'operator-review-20260822'
  );

-- 폐업 또는 현행 상태가 미확인인 장소는 복구 가능한 소프트 숨김으로만 처리한다.
update public.places
set
  deleted_at = '2026-08-22T02:00:00.000Z'::timestamptz,
  operational_status = case id
    when 'f7f731e4-afd8-4072-8210-680919c7069d'::uuid then 'permanently_closed'
    else operational_status
  end,
  last_verified_at = '2026-08-22T02:00:00.000Z'::timestamptz,
  next_verification_at = case id
    when 'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf'::uuid then '2026-09-05T02:00:00.000Z'::timestamptz
    when '004cf50b-b141-43d1-89ea-2d24cd5655bc'::uuid then '2026-09-05T02:00:00.000Z'::timestamptz
    when '5c86fce3-4d39-46ef-91e0-d262e9fb4235'::uuid then '2026-09-05T02:00:00.000Z'::timestamptz
    else null
  end
where id in (
  '004cf50b-b141-43d1-89ea-2d24cd5655bc',
  '5c86fce3-4d39-46ef-91e0-d262e9fb4235',
  'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf',
  'f7f731e4-afd8-4072-8210-680919c7069d'
);

-- 돈키호테 1988은 같은 102호의 도도이꾸로 리브랜딩된 동일 장소다.
update public.places
set
  name = '도도이꾸',
  description = '밀양 삼랑진의 바이크 테마 카페예요. 기존 돈키호테 1988과 같은 장소에서 도도이꾸로 상호가 변경됐어요.',
  location = public.st_setsrid(public.st_makepoint(128.845067018604, 35.4005019388143), 4326)::public.geography,
  address = '경남 밀양시 삼랑진읍 천태로 98 102호',
  tags = array['바이크카페', '밀양', '삼랑진'],
  opening_hours = null,
  hours = null,
  source_provider = 'kakao',
  source_place_id = '1049956456',
  operational_status = 'operational',
  last_verified_at = '2026-08-22T02:00:00.000Z'::timestamptz,
  next_verification_at = '2026-09-21T02:00:00.000Z'::timestamptz
where id = '45877d0d-b367-4cb6-a638-3c53af86a8cc';

-- 루트세븐은 다른 주소의 캠핑장 정보가 섞여 있어 2829의 레저타운으로 교정한다.
update public.places
set
  description = '포항 송라면 동해대로 2829의 바이크·ATV·수상레저 거점이에요. 같은 부지의 클럽하우스 카페에서 쉬어갈 수 있어요.',
  location = public.st_setsrid(public.st_makepoint(129.35419681207, 36.2185440671356), 4326)::public.geography,
  address = '경북 포항시 북구 송라면 동해대로 2829',
  phone = '054-255-5882',
  tags = array['바이크카페', '포항', '7번국도', '레저'],
  source_provider = 'kakao',
  source_place_id = '1253122948',
  last_verified_at = '2026-08-22T02:00:00.000Z'::timestamptz,
  next_verification_at = '2026-09-21T02:00:00.000Z'::timestamptz
where id = 'c0f614bf-9902-4b03-ad41-ce7ad1bec892';

-- 바이크마트 청주점은 같은 영업점의 CONQUER 청주점 리브랜딩·이전으로 교정한다.
update public.places
set
  name = 'CONQUER 청주점',
  description = '바이크 용품을 둘러보고 카페에서 쉬어갈 수 있는 청주 라이더 거점이에요.',
  category = 'gear_shop',
  location = public.st_setsrid(public.st_makepoint(127.469493109112, 36.664119731886), 4326)::public.geography,
  address = '충북 청주시 청원구 무심동로 744',
  phone = '0507-1484-9803',
  tags = array['용품점', '바이크카페', '청주'],
  opening_hours = null,
  hours = null,
  parking_info = null,
  source_provider = 'kakao',
  source_place_id = '469181103',
  operational_status = 'operational',
  last_verified_at = '2026-08-22T02:00:00.000Z'::timestamptz,
  next_verification_at = '2026-09-21T02:00:00.000Z'::timestamptz
where id = 'eab49697-79c2-4259-a203-e43bbc66318e';

-- 실제 조치도 주 근거와 연결해 추가 전용 이력으로 남긴다.
insert into public.place_curation_actions (
  place_id,
  evidence_id,
  action_type,
  reason,
  previous_state,
  new_state,
  acted_by
)
select
  p.id,
  evidence.id,
  decision.action_type,
  decision.reason,
  before.previous_state,
  jsonb_build_object(
    'name', p.name,
    'description', p.description,
    'category', p.category,
    'latitude', public.st_y(p.location::public.geometry),
    'longitude', public.st_x(p.location::public.geometry),
    'address', p.address,
    'phone', p.phone,
    'tags', p.tags,
    'opening_hours', p.opening_hours,
    'hours', p.hours,
    'parking_info', p.parking_info,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'source_provider', p.source_provider,
    'source_place_id', p.source_place_id,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'is_curation_protected', p.is_curation_protected,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ),
  'operator-review-20260822'
from (
  values
    ('f7f731e4-afd8-4072-8210-680919c7069d'::uuid, 'soft_hide', 'operator-decision-20260822:rider-cafe-w-closed', 'operator-decision-20260822:rider-cafe-w-closed'),
    ('f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf'::uuid, 'soft_hide', 'operator-decision-20260822:philip-hide', 'operator-decision-20260822:philip-hide'),
    ('5c86fce3-4d39-46ef-91e0-d262e9fb4235'::uuid, 'soft_hide', 'operator-decision-20260822:jukryeong-hide', 'operator-decision-20260822:jukryeong-hide'),
    ('45877d0d-b367-4cb6-a638-3c53af86a8cc'::uuid, 'update_identity', 'operator-decision-20260822:donquixote-to-dodoikku', 'operator-decision-20260822:donquixote-to-dodoikku'),
    ('c0f614bf-9902-4b03-ad41-ce7ad1bec892'::uuid, 'update_identity', 'operator-decision-20260822:route-seven-address', 'operator-decision-20260822:route-seven-address'),
    ('004cf50b-b141-43d1-89ea-2d24cd5655bc'::uuid, 'soft_hide', 'operator-decision-20260822:bnb-hide', 'operator-decision-20260822:bnb-hide'),
    ('eab49697-79c2-4259-a203-e43bbc66318e'::uuid, 'update_identity', 'operator-decision-20260822:bikemart-to-conquer', 'operator-decision-20260822:bikemart-to-conquer')
) decision(place_id, action_type, reason, evidence_reference)
join public.places p on p.id = decision.place_id
join operator_place_decisions_20260822_before before on before.id = p.id
join public.place_curation_evidence evidence
  on evidence.place_id = p.id
 and evidence.source_reference = decision.evidence_reference
 and evidence.observed_at = '2026-08-22T02:00:00.000Z'::timestamptz;

do $$
begin
  if not exists (
    select 1 from public.places
    where id = 'f7f731e4-afd8-4072-8210-680919c7069d'
      and operational_status = 'permanently_closed'
      and deleted_at = '2026-08-22T02:00:00.000Z'::timestamptz
  ) then
    raise exception '라이더카페더블유 폐업 숨김 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.places
    where id in (
      '004cf50b-b141-43d1-89ea-2d24cd5655bc',
      '5c86fce3-4d39-46ef-91e0-d262e9fb4235',
      'f0b57cd6-0a27-433d-9b4f-f2a7bddf59cf',
      'f7f731e4-afd8-4072-8210-680919c7069d'
    )
      and deleted_at = '2026-08-22T02:00:00.000Z'::timestamptz
  ) <> 4 then
    raise exception '소프트 숨김 4건 검증에 실패했습니다.';
  end if;

  if not exists (
    select 1 from public.places
    where id = '45877d0d-b367-4cb6-a638-3c53af86a8cc'
      and name = '도도이꾸'
      and address = '경남 밀양시 삼랑진읍 천태로 98 102호'
      and source_provider = 'kakao'
      and source_place_id = '1049956456'
      and operational_status = 'operational'
      and deleted_at is null
  ) then
    raise exception '도도이꾸 동일 장소 교정 검증에 실패했습니다.';
  end if;

  if not exists (
    select 1 from public.places
    where id = 'c0f614bf-9902-4b03-ad41-ce7ad1bec892'
      and name = '루트세븐 레저타운'
      and address = '경북 포항시 북구 송라면 동해대로 2829'
      and source_provider = 'kakao'
      and source_place_id = '1253122948'
      and operational_status = 'unknown'
      and deleted_at is null
  ) then
    raise exception '루트세븐 레저타운 주소 교정 검증에 실패했습니다.';
  end if;

  if not exists (
    select 1 from public.places
    where id = 'eab49697-79c2-4259-a203-e43bbc66318e'
      and name = 'CONQUER 청주점'
      and address = '충북 청주시 청원구 무심동로 744'
      and category = 'gear_shop'
      and source_provider = 'kakao'
      and source_place_id = '469181103'
      and operational_status = 'operational'
      and deleted_at is null
  ) then
    raise exception 'CONQUER 청주점 교정 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.place_curation_evidence
    where source_reference like 'operator-decision-20260822:%'
  ) <> 11 then
    raise exception '운영자 결정 근거 11건 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.place_curation_actions
    where reason like 'operator-decision-20260822:%'
  ) <> 7 then
    raise exception '운영자 결정 조치 7건 검증에 실패했습니다.';
  end if;
end
$$;

commit;
