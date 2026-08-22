-- 운영자가 모토맵 선별 대상에서 제외한 26곳을 복구 가능한 방식으로 숨긴다.
-- 즐겨찾기는 같은 좌표의 일반 장소로 전환하고, 실제 다른 이용자의 리뷰·주행·
-- 라이더 정보가 새로 생겼다면 적용 직전에 중단한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  target_ids constant uuid[] := array[
    '00118307-aec6-4f60-bbc3-bba127368b1d'::uuid,
    '10139612-fc60-4ad3-89c5-985c33ed1326'::uuid,
    '155ee20a-9b22-4022-b9cf-63e31e041830'::uuid,
    '1a17e2d4-80a6-4337-9290-75e42c5ea757'::uuid,
    '1c8a7602-8914-49dd-aa3c-12c1e0aefbbf'::uuid,
    '264c77e4-8688-4805-b0eb-33dd0c6f2dff'::uuid,
    '2f1283a1-ef3e-420e-a050-6f0741692cfd'::uuid,
    '418e87c9-92a2-4d06-b4db-8e8a1dab0809'::uuid,
    '4d253442-3d7a-4985-a9a0-afe8e5005c60'::uuid,
    '5598f4f4-3a33-40b5-aa8a-b0cd2617469e'::uuid,
    '5c4a62f1-21e7-4c5e-b279-fb25e2b2611d'::uuid,
    '6bedb753-7e50-4b50-9d1a-ef0c92217767'::uuid,
    '717a2e72-4d05-4e06-b0cc-5097b315d8f8'::uuid,
    '7b79aa43-3a1c-4d85-b2df-7be20a4a4224'::uuid,
    '8183ad96-edee-48f0-9a0f-e5b856f6c105'::uuid,
    '855e2221-7533-4f38-bc5a-a4e3acafac28'::uuid,
    '8ccf0e99-d1e2-4947-baf8-d6e84e952a1c'::uuid,
    '956a17dc-31b3-4218-af65-87cb6f1edc3a'::uuid,
    'b4819bc0-1428-4489-b9e4-836357c50155'::uuid,
    'ba6a45ec-ef41-4148-ab05-26fd92b31ba5'::uuid,
    'bcd6c94e-49b0-4959-95f1-bda39636138a'::uuid,
    'de0e7ca1-61f2-49fa-a3c1-1fb052c4c794'::uuid,
    'e66e697d-c276-47f4-8cfb-4d022b4b698a'::uuid,
    'ed1a867c-bac4-478c-92db-cf21d4e5a7aa'::uuid,
    'f599d4a8-ae92-4f7f-b5eb-6e69d8865dad'::uuid,
    'f6d2d505-18a0-4107-880f-f7d212bc5549'::uuid
  ];
  allowed_user_ids constant uuid[] := array[
    '28ce059b-4689-4109-aa05-dc2ea3f95011'::uuid,
    '3cd44c12-bbf8-4e7e-9d3c-d0f3b0280ed7'::uuid,
    '877ba1fd-4acd-4af1-b7c5-8df4c8397f33'::uuid
  ];
begin
  -- 삭제 대상과 이름 변경 대상을 한 트랜잭션 안에서 고정한다.
  perform p.id
  from public.places p
  where p.id = any(target_ids)
     or p.id = '806f4964-700e-4d46-aa57-25e51ed17d91'::uuid
  order by p.id
  for update;

  if exists (
    select 1
    from (
      values
        ('00118307-aec6-4f60-bbc3-bba127368b1d'::uuid, '광덕고개쉼터'),
        ('10139612-fc60-4ad3-89c5-985c33ed1326'::uuid, '저곡식당'),
        ('155ee20a-9b22-4022-b9cf-63e31e041830'::uuid, '여여식당'),
        ('1a17e2d4-80a6-4337-9290-75e42c5ea757'::uuid, '달궁식당'),
        ('1c8a7602-8914-49dd-aa3c-12c1e0aefbbf'::uuid, '까꾸네모리국수'),
        ('264c77e4-8688-4805-b0eb-33dd0c6f2dff'::uuid, '헤이리예술마을'),
        ('2f1283a1-ef3e-420e-a050-6f0741692cfd'::uuid, '로밍온앤오프 & 롤링하츠'),
        ('418e87c9-92a2-4d06-b4db-8e8a1dab0809'::uuid, '국일식당'),
        ('4d253442-3d7a-4985-a9a0-afe8e5005c60'::uuid, '삼대광양불고기집'),
        ('5598f4f4-3a33-40b5-aa8a-b0cd2617469e'::uuid, '공가네 한우국밥전문점 하남점'),
        ('5c4a62f1-21e7-4c5e-b279-fb25e2b2611d'::uuid, '하남면옥'),
        ('6bedb753-7e50-4b50-9d1a-ef0c92217767'::uuid, '새재할매집'),
        ('717a2e72-4d05-4e06-b0cc-5097b315d8f8'::uuid, '원조이동김미자할머니갈비'),
        ('7b79aa43-3a1c-4d85-b2df-7be20a4a4224'::uuid, '충주호'),
        ('8183ad96-edee-48f0-9a0f-e5b856f6c105'::uuid, '우리식당'),
        ('855e2221-7533-4f38-bc5a-a4e3acafac28'::uuid, '세계주류마켓'),
        ('8ccf0e99-d1e2-4947-baf8-d6e84e952a1c'::uuid, '주차장식당'),
        ('956a17dc-31b3-4218-af65-87cb6f1edc3a'::uuid, '샘밭막국수'),
        ('b4819bc0-1428-4489-b9e4-836357c50155'::uuid, '미사리밀빛초계국수 본점'),
        ('ba6a45ec-ef41-4148-ab05-26fd92b31ba5'::uuid, '혜성식당'),
        ('bcd6c94e-49b0-4959-95f1-bda39636138a'::uuid, '옥천냉면 황해식당'),
        ('de0e7ca1-61f2-49fa-a3c1-1fb052c4c794'::uuid, '변산명인바지락죽'),
        ('e66e697d-c276-47f4-8cfb-4d022b4b698a'::uuid, '티하우스에덴'),
        ('ed1a867c-bac4-478c-92db-cf21d4e5a7aa'::uuid, '새집추어탕'),
        ('f599d4a8-ae92-4f7f-b5eb-6e69d8865dad'::uuid, '단천식당'),
        ('f6d2d505-18a0-4107-880f-f7d212bc5549'::uuid, '선광집')
    ) expected(id, name)
    left join public.places p on p.id = expected.id
    where p.name is distinct from expected.name
       or p.approved is distinct from true
       or p.deleted_at is not null
  ) or (
    select count(*)
    from public.places p
    where p.id = any(target_ids)
  ) <> 26 then
    raise exception '등록 해제 대상 26곳의 현재 상태가 감사 시점과 다릅니다.';
  end if;

  if not exists (
    select 1
    from public.places p
    where p.id = '806f4964-700e-4d46-aa57-25e51ed17d91'::uuid
      and p.name = '귀산라이더카페 브룸'
      and p.approved = true
      and p.deleted_at is null
  ) then
    raise exception '브룸카페 이름 변경 대상의 현재 상태가 감사 시점과 다릅니다.';
  end if;

  -- 운영자 본인과 문서화된 테스트 계정 이외의 사용자 기록은 자동 처리하지 않는다.
  if exists (
    select 1
    from public.reviews r
    where r.place_id = any(target_ids)
      and (r.user_id is null or r.user_id <> all(allowed_user_ids))
  ) or exists (
    select 1
    from public.place_rides r
    where r.place_id = any(target_ids)
      and r.user_id <> all(allowed_user_ids)
  ) or exists (
    select 1
    from public.place_rider_fact_votes v
    where v.place_id = any(target_ids)
      and v.user_id <> all(allowed_user_ids)
  ) or exists (
    select 1
    from public.review_likes l
    join public.reviews r on r.id = l.review_id
    where r.place_id = any(target_ids)
      and l.user_id <> all(allowed_user_ids)
  ) or exists (
    select 1
    from public.reports r
    where r.target_type = 'place'
      and r.target_id = any(target_ids)
      and r.reporter_id <> all(allowed_user_ids)
  ) then
    raise exception '실제 다른 이용자의 연결 기록이 생겨 등록 해제를 중단합니다.';
  end if;

  if exists (
    select 1
    from public.places p
    where p.id = any(target_ids)
      and p.submitted_by is not null
      and p.submitted_by <> all(allowed_user_ids)
  ) then
    raise exception '실제 다른 이용자가 제보한 장소가 포함되어 등록 해제를 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence e
    where e.source_reference like 'operator-decision-20260822:deregister:%'
       or e.source_reference = 'operator-decision-20260822:broom-rename'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_places_20260822_before
on commit drop
as
select
  p.id,
  p.name,
  p.address,
  p.phone,
  public.st_y(p.location::public.geometry) as latitude,
  public.st_x(p.location::public.geometry) as longitude,
  left(lower(btrim(p.name)), 150)
    || '|'
    || to_char(round(public.st_y(p.location::public.geometry)::numeric, 5), 'FM999990.00000')
    || ','
    || to_char(round(public.st_x(p.location::public.geometry)::numeric, 5), 'FM999990.00000')
    as coordinate_key,
  jsonb_build_object(
    'name', p.name,
    'address', p.address,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'is_curation_protected', p.is_curation_protected,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ) as previous_state
from public.places p
where p.id in (
  '00118307-aec6-4f60-bbc3-bba127368b1d',
  '10139612-fc60-4ad3-89c5-985c33ed1326',
  '155ee20a-9b22-4022-b9cf-63e31e041830',
  '1a17e2d4-80a6-4337-9290-75e42c5ea757',
  '1c8a7602-8914-49dd-aa3c-12c1e0aefbbf',
  '264c77e4-8688-4805-b0eb-33dd0c6f2dff',
  '2f1283a1-ef3e-420e-a050-6f0741692cfd',
  '418e87c9-92a2-4d06-b4db-8e8a1dab0809',
  '4d253442-3d7a-4985-a9a0-afe8e5005c60',
  '5598f4f4-3a33-40b5-aa8a-b0cd2617469e',
  '5c4a62f1-21e7-4c5e-b279-fb25e2b2611d',
  '6bedb753-7e50-4b50-9d1a-ef0c92217767',
  '717a2e72-4d05-4e06-b0cc-5097b315d8f8',
  '7b79aa43-3a1c-4d85-b2df-7be20a4a4224',
  '8183ad96-edee-48f0-9a0f-e5b856f6c105',
  '855e2221-7533-4f38-bc5a-a4e3acafac28',
  '8ccf0e99-d1e2-4947-baf8-d6e84e952a1c',
  '956a17dc-31b3-4218-af65-87cb6f1edc3a',
  'b4819bc0-1428-4489-b9e4-836357c50155',
  'ba6a45ec-ef41-4148-ab05-26fd92b31ba5',
  'bcd6c94e-49b0-4959-95f1-bda39636138a',
  'de0e7ca1-61f2-49fa-a3c1-1fb052c4c794',
  'e66e697d-c276-47f4-8cfb-4d022b4b698a',
  'ed1a867c-bac4-478c-92db-cf21d4e5a7aa',
  'f599d4a8-ae92-4f7f-b5eb-6e69d8865dad',
  'f6d2d505-18a0-4107-880f-f7d212bc5549'
);

do $$
begin
  if exists (
    select 1
    from deregister_places_20260822_before t
    join public.general_places gp
      on gp.provider = 'coordinate'
     and gp.provider_place_id = t.coordinate_key
    where gp.promoted_place_id is not null
      and gp.promoted_place_id <> t.id
  ) then
    raise exception '일반 장소 식별자가 다른 등록 장소와 충돌합니다.';
  end if;
end
$$;

-- 앱의 coordinate 일반 장소 식별 규칙과 같은 키를 만들어 즐겨찾기의 목적지를 보존한다.
insert into public.general_places (
  provider,
  provider_place_id,
  name,
  address,
  latitude,
  longitude,
  phone,
  promoted_place_id
)
select
  'coordinate',
  t.coordinate_key,
  t.name,
  t.address,
  t.latitude,
  t.longitude,
  t.phone,
  null
from deregister_places_20260822_before t
on conflict (provider, provider_place_id) do nothing;

update public.general_places gp
set promoted_place_id = null
from deregister_places_20260822_before t
where gp.provider = 'coordinate'
  and gp.provider_place_id = t.coordinate_key
  and gp.promoted_place_id = t.id;

create temporary table deregister_favorites_20260822_before
on commit drop
as
select
  f.id,
  f.user_id,
  t.id as place_id,
  t.latitude,
  t.longitude,
  gp.id as general_place_id
from public.favorites f
join deregister_places_20260822_before t on t.id = f.place_id
join public.general_places gp
  on gp.provider = 'coordinate'
 and gp.provider_place_id = t.coordinate_key;

-- 같은 이용자가 이미 동일 좌표의 일반 즐겨찾기를 갖고 있으면 등록 즐겨찾기만 합친다.
delete from public.favorites registered
using deregister_favorites_20260822_before snapshot
where registered.id = snapshot.id
  and exists (
    select 1
    from public.favorites general
    where general.user_id = snapshot.user_id
      and general.place_id is null
      and (
        general.general_place_id = snapshot.general_place_id
        or (
          round(general.latitude::numeric, 5) = round(snapshot.latitude::numeric, 5)
          and round(general.longitude::numeric, 5) = round(snapshot.longitude::numeric, 5)
        )
      )
  );

update public.favorites f
set
  place_id = null,
  general_place_id = gp.id,
  name = t.name,
  address = t.address,
  latitude = t.latitude,
  longitude = t.longitude,
  phone = t.phone
from deregister_places_20260822_before t
join public.general_places gp
  on gp.provider = 'coordinate'
 and gp.provider_place_id = t.coordinate_key
where f.place_id = t.id;

-- 운영자 판단과 변경 전 상태를 추가 전용 근거에 남긴다.
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
  t.id,
  'manual_review',
  'relevance_rejected',
  'strong',
  '모토맵 운영자 직접 검증',
  'operator-decision-20260822:deregister:' || t.id::text,
  '2026-08-22T05:57:41.000Z'::timestamptz,
  jsonb_build_object(
    'decision', '모토맵 등록 장소에서 제외하고 일반 장소로 유지',
    'hard_delete', false,
    'preserve_general_favorites', true,
    'previous_state', t.previous_state
  ),
  'operator-review-20260822'
from deregister_places_20260822_before t;

update public.places p
set
  deleted_at = '2026-08-22T05:57:41.000Z'::timestamptz,
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = '2026-08-22T05:57:41.000Z'::timestamptz,
  next_verification_at = null
from deregister_places_20260822_before t
where p.id = t.id;

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
  e.id,
  'soft_hide',
  '운영자 판단에 따라 모토맵 등록 장소에서 제외하고 일반 장소 즐겨찾기는 유지',
  t.previous_state,
  jsonb_build_object(
    'name', p.name,
    'address', p.address,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'is_curation_protected', p.is_curation_protected,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ),
  'operator-review-20260822'
from deregister_places_20260822_before t
join public.places p on p.id = t.id
join public.place_curation_evidence e
  on e.place_id = t.id
 and e.source_reference = 'operator-decision-20260822:deregister:' || t.id::text
 and e.observed_at = '2026-08-22T05:57:41.000Z'::timestamptz;

create temporary table broom_rename_20260822_before
on commit drop
as
select
  p.id,
  jsonb_build_object(
    'name', p.name,
    'address', p.address,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ) as previous_state
from public.places p
where p.id = '806f4964-700e-4d46-aa57-25e51ed17d91';

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
  id,
  'manual_review',
  'identity_changed',
  'strong',
  '모토맵 운영자 직접 검증',
  'operator-decision-20260822:broom-rename',
  '2026-08-22T05:57:41.000Z'::timestamptz,
  jsonb_build_object(
    'decision', '귀산라이더카페 브룸의 현행 표시 이름을 브룸카페로 변경',
    'preserve_place_id', true,
    'previous_state', previous_state
  ),
  'operator-review-20260822'
from broom_rename_20260822_before;

update public.places
set
  name = '브룸카페',
  last_verified_at = '2026-08-22T05:57:41.000Z'::timestamptz,
  next_verification_at = '2026-09-21T05:57:41.000Z'::timestamptz
where id = '806f4964-700e-4d46-aa57-25e51ed17d91';

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
  e.id,
  'update_identity',
  '운영자 확인에 따라 표시 이름을 브룸카페로 변경',
  before.previous_state,
  jsonb_build_object(
    'name', p.name,
    'address', p.address,
    'approved', p.approved,
    'deleted_at', p.deleted_at,
    'relevance_status', p.relevance_status,
    'operational_status', p.operational_status,
    'last_verified_at', p.last_verified_at,
    'next_verification_at', p.next_verification_at
  ),
  'operator-review-20260822'
from broom_rename_20260822_before before
join public.places p on p.id = before.id
join public.place_curation_evidence e
  on e.place_id = before.id
 and e.source_reference = 'operator-decision-20260822:broom-rename'
 and e.observed_at = '2026-08-22T05:57:41.000Z'::timestamptz;

do $$
begin
  if (
    select count(*)
    from public.places p
    join deregister_places_20260822_before t on t.id = p.id
    where p.deleted_at = '2026-08-22T05:57:41.000Z'::timestamptz
      and p.relevance_status = 'excluded'
      and p.is_curation_protected = false
  ) <> 26 then
    raise exception '등록 장소 26곳의 소프트 숨김 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from public.favorites f
    join deregister_places_20260822_before t on t.id = f.place_id
  ) then
    raise exception '등록 장소 즐겨찾기가 일반 장소로 전환되지 않았습니다.';
  end if;

  if exists (
    select 1
    from deregister_favorites_20260822_before snapshot
    where not exists (
      select 1
      from public.favorites f
      where f.user_id = snapshot.user_id
        and f.place_id is null
        and (
          f.general_place_id = snapshot.general_place_id
          or (
            round(f.latitude::numeric, 5) = round(snapshot.latitude::numeric, 5)
            and round(f.longitude::numeric, 5) = round(snapshot.longitude::numeric, 5)
          )
        )
    )
  ) then
    raise exception '일반 장소 즐겨찾기 보존 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.general_places gp
    join deregister_places_20260822_before t
      on gp.provider = 'coordinate'
     and gp.provider_place_id = t.coordinate_key
    where gp.promoted_place_id is null
  ) <> 26 then
    raise exception '일반 장소 식별자 26건 생성 검증에 실패했습니다.';
  end if;

  if not exists (
    select 1
    from public.places
    where id = '806f4964-700e-4d46-aa57-25e51ed17d91'
      and name = '브룸카페'
      and approved = true
      and deleted_at is null
  ) then
    raise exception '브룸카페 이름 변경 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.place_curation_evidence
    where source_reference like 'operator-decision-20260822:deregister:%'
  ) <> 26 or (
    select count(*)
    from public.place_curation_actions a
    join public.place_curation_evidence e on e.id = a.evidence_id
    where e.source_reference like 'operator-decision-20260822:deregister:%'
      and a.action_type = 'soft_hide'
  ) <> 26 then
    raise exception '등록 해제 감사 이력 26건 검증에 실패했습니다.';
  end if;

  if (
    select count(*)
    from public.place_curation_evidence e
    where e.source_reference = 'operator-decision-20260822:broom-rename'
  ) <> 1 or (
    select count(*)
    from public.place_curation_actions a
    join public.place_curation_evidence e on e.id = a.evidence_id
    where e.source_reference = 'operator-decision-20260822:broom-rename'
      and a.action_type = 'update_identity'
  ) <> 1 then
    raise exception '브룸카페 이름 변경 감사 이력 검증에 실패했습니다.';
  end if;
end
$$;

commit;
