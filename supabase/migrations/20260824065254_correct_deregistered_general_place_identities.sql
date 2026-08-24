-- 좌표 식별자로 만든 두 일반 장소를 사용자가 실제로 다시 여는 카카오 장소 ID에 연결한다.
-- 리뷰·즐겨찾기 행과 일반 장소 UUID는 그대로 유지한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table correct_general_place_identity_20260824 (
  place_id uuid primary key,
  general_place_id uuid unique not null,
  previous_provider text not null,
  previous_provider_place_id text not null,
  previous_name text not null,
  previous_address text not null,
  previous_phone text,
  previous_latitude double precision not null,
  previous_longitude double precision not null,
  provider text not null,
  provider_place_id text not null,
  name text not null,
  address text not null,
  phone text,
  latitude double precision not null,
  longitude double precision not null,
  place_url text not null,
  review_id uuid not null,
  favorite_id uuid
) on commit drop;

insert into correct_general_place_identity_20260824 values
  (
    '6950d68f-35f4-49c5-8406-8099cc755819',
    '94973b1e-a2d7-4282-99f0-8dff1dddfab8',
    'coordinate',
    '왈츠와닥터만|37.59182,127.33829',
    '왈츠와닥터만',
    '경기 남양주시 조안면 북한강로 856-37',
    '031-576-0020',
    37.59182,
    127.33829,
    'kakao',
    '12995429',
    '왈츠와 닥터만',
    '경기 남양주시 조안면 북한강로 856-37',
    '031-576-6069',
    37.59206453803903,
    127.33835540938347,
    'http://place.map.kakao.com/12995429',
    '2e022a53-f897-44ac-be19-399509f51a1c',
    null
  ),
  (
    'ea91be84-c45a-4c6f-a859-fcb8e561817b',
    '1088638e-b5fb-45bb-990c-cce4480e48c9',
    'coordinate',
    '고구려돼지갈비|37.37090,127.25013',
    '고구려돼지갈비',
    '경기 광주시 양촌길 145',
    '031-766-5595',
    37.3709,
    127.25013,
    'kakao',
    '8761474',
    '고구려',
    '경기 광주시 양촌길 145',
    '031-766-5595',
    37.37087056451839,
    127.25037942348686,
    'http://place.map.kakao.com/8761474',
    '19e1ddd7-ddc3-44b8-b567-999c39ac03ff',
    'ecca38d8-392a-4894-9982-de06126a57a7'
  );

do $$
declare
  mismatch_count integer;
begin
  perform place.id
  from public.places place
  join correct_general_place_identity_20260824 target on target.place_id = place.id
  order by place.id
  for update;

  perform general.id
  from public.general_places general
  join correct_general_place_identity_20260824 target
    on target.general_place_id = general.id
  order by general.id
  for update;

  select count(*)
  into mismatch_count
  from correct_general_place_identity_20260824 target
  left join public.places place on place.id = target.place_id
  left join public.general_places general on general.id = target.general_place_id
  where place.id is null
     or place.deleted_at is null
     or place.relevance_status <> 'excluded'
     or general.id is null
     or general.provider <> target.previous_provider
     or general.provider_place_id <> target.previous_provider_place_id
     or general.name <> target.previous_name
     or general.address <> target.previous_address
     or general.phone is distinct from target.previous_phone
     or abs(general.latitude - target.previous_latitude) > 0.000001
     or abs(general.longitude - target.previous_longitude) > 0.000001
     or general.promoted_place_id is not null
     or general.review_count <> 1
     or general.rating <> 5;

  if mismatch_count <> 0 then
    raise exception '일반 장소 식별자 보정 대상이 검증 스냅샷과 다릅니다: %곳', mismatch_count;
  end if;

  if exists (
    select 1
    from correct_general_place_identity_20260824 target
    join public.general_places collision
      on collision.provider = target.provider
     and collision.provider_place_id = target.provider_place_id
     and collision.id <> target.general_place_id
  ) then
    raise exception '보정할 카카오 장소 ID가 다른 일반 장소에 이미 연결돼 있습니다.';
  end if;

  if exists (
    select 1
    from correct_general_place_identity_20260824 target
    where not exists (
      select 1
      from public.reviews review
      where review.id = target.review_id
        and review.place_id is null
        and review.general_place_id = target.general_place_id
    )
       or (
         select count(*) from public.reviews review
         where review.general_place_id = target.general_place_id
       ) <> 1
       or (
         target.favorite_id is null
         and exists (
           select 1 from public.favorites favorite
           where favorite.general_place_id = target.general_place_id
         )
       )
       or (
         target.favorite_id is not null
         and not exists (
           select 1 from public.favorites favorite
           where favorite.id = target.favorite_id
             and favorite.place_id is null
             and favorite.general_place_id = target.general_place_id
         )
       )
  ) then
    raise exception '리뷰 또는 즐겨찾기 보정 전 연결 상태가 검증값과 다릅니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference like 'operator-correct-general-identity-20260824:%'
  ) then
    raise exception '같은 일반 장소 식별자 보정을 이미 반영했습니다.';
  end if;
end
$$;

update public.general_places general
set
  provider = target.provider,
  provider_place_id = target.provider_place_id,
  name = target.name,
  address = target.address,
  phone = target.phone,
  latitude = target.latitude,
  longitude = target.longitude,
  place_url = target.place_url
from correct_general_place_identity_20260824 target
where general.id = target.general_place_id;

-- 즐겨찾기 행 ID와 생성 시각은 유지하고 장소 스냅샷만 현재 외부 장소와 맞춘다.
update public.favorites favorite
set
  name = target.name,
  address = target.address,
  phone = target.phone,
  latitude = target.latitude,
  longitude = target.longitude
from correct_general_place_identity_20260824 target
where favorite.general_place_id = target.general_place_id;

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
  target.place_id,
  'map_provider',
  'identity_changed',
  'strong',
  '카카오 로컬 장소 ID 교차 확인',
  'operator-correct-general-identity-20260824:' || target.place_id::text,
  transaction_timestamp(),
  jsonb_build_object(
    'reason', '좌표 식별자가 앱에서 선택한 카카오 장소와 일치하지 않아 리뷰가 보이지 않음',
    'preserved_general_place_id', target.general_place_id,
    'preserved_review_id', target.review_id,
    'preserved_favorite_id', target.favorite_id,
    'previous_identity', jsonb_build_object(
      'provider', target.previous_provider,
      'provider_place_id', target.previous_provider_place_id,
      'name', target.previous_name,
      'address', target.previous_address,
      'phone', target.previous_phone,
      'latitude', target.previous_latitude,
      'longitude', target.previous_longitude
    ),
    'new_identity', jsonb_build_object(
      'provider', target.provider,
      'provider_place_id', target.provider_place_id,
      'name', target.name,
      'address', target.address,
      'phone', target.phone,
      'latitude', target.latitude,
      'longitude', target.longitude,
      'place_url', target.place_url
    )
  ),
  'operator-review-20260824'
from correct_general_place_identity_20260824 target;

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
  target.place_id,
  evidence.id,
  'update_identity',
  '등록 해제 일반 장소를 사용자가 실제로 여는 카카오 장소 ID에 연결함',
  jsonb_build_object(
    'general_place_id', target.general_place_id,
    'provider', target.previous_provider,
    'provider_place_id', target.previous_provider_place_id,
    'name', target.previous_name,
    'latitude', target.previous_latitude,
    'longitude', target.previous_longitude
  ),
  jsonb_build_object(
    'general_place_id', target.general_place_id,
    'provider', target.provider,
    'provider_place_id', target.provider_place_id,
    'name', target.name,
    'latitude', target.latitude,
    'longitude', target.longitude
  ),
  'operator-review-20260824'
from correct_general_place_identity_20260824 target
join public.place_curation_evidence evidence
  on evidence.place_id = target.place_id
 and evidence.source_reference =
   'operator-correct-general-identity-20260824:' || target.place_id::text;

do $$
begin
  if exists (
    select 1
    from correct_general_place_identity_20260824 target
    left join public.general_places general on general.id = target.general_place_id
    where general.id is null
       or general.provider <> target.provider
       or general.provider_place_id <> target.provider_place_id
       or general.name <> target.name
       or general.address <> target.address
       or general.phone is distinct from target.phone
       or abs(general.latitude - target.latitude) > 0.000001
       or abs(general.longitude - target.longitude) > 0.000001
       or general.place_url <> target.place_url
       or general.review_count <> 1
       or general.rating <> 5
       or not exists (
         select 1
         from public.reviews review
         where review.id = target.review_id
           and review.general_place_id = target.general_place_id
           and review.place_id is null
       )
       or (
         target.favorite_id is not null
         and not exists (
           select 1
           from public.favorites favorite
           where favorite.id = target.favorite_id
             and favorite.general_place_id = target.general_place_id
             and favorite.place_id is null
         )
       )
       or not exists (
         select 1
         from public.place_curation_evidence evidence
         where evidence.place_id = target.place_id
           and evidence.source_reference =
             'operator-correct-general-identity-20260824:' || target.place_id::text
       )
       or not exists (
         select 1
         from public.place_curation_actions action
         join public.place_curation_evidence evidence on evidence.id = action.evidence_id
         where action.place_id = target.place_id
           and action.action_type = 'update_identity'
           and evidence.source_reference =
             'operator-correct-general-identity-20260824:' || target.place_id::text
       )
  ) then
    raise exception '일반 장소 식별자 보정 사후 검증에 실패했습니다.';
  end if;
end
$$;

commit;
