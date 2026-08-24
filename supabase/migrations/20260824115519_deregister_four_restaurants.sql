-- 운영자 판단으로 일반 음식점 네 곳을 모토맵 등록 장소에서 제외하고 일반 장소로 전환한다.
-- 실제 카카오 장소 식별자를 사용하고, 혹시 생긴 이용 기록은 검증 스냅샷과 다르면 전환을 중단한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table deregister_four_restaurants_20260824 (
  expected_name text primary key,
  expected_address text not null,
  expected_phone text,
  expected_latitude double precision not null,
  expected_longitude double precision not null,
  provider text not null,
  provider_place_id text unique not null,
  general_name text not null,
  general_address text not null,
  general_phone text,
  general_latitude double precision not null,
  general_longitude double precision not null,
  place_url text not null,
  place_id uuid unique,
  general_place_id uuid unique,
  previous_state jsonb
) on commit drop;

insert into deregister_four_restaurants_20260824 (
  expected_name,
  expected_address,
  expected_phone,
  expected_latitude,
  expected_longitude,
  provider,
  provider_place_id,
  general_name,
  general_address,
  general_phone,
  general_latitude,
  general_longitude,
  place_url
) values
  (
    '통나무집닭갈비',
    '강원 춘천시 신북읍 신샘밭로 763',
    '033-241-5999',
    37.93311,
    127.79324,
    'kakao',
    '8107636',
    '통나무집닭갈비 본점',
    '강원 춘천시 신북읍 신샘밭로 763',
    '033-241-5999',
    37.93312540516689,
    127.79328557859613,
    'http://place.map.kakao.com/8107636'
  ),
  (
    '망향비빔국수 본점',
    '경기 연천군 청산면 궁평로 5',
    '031-835-3575',
    38.023879993402,
    127.109307909138,
    'kakao',
    '1890069478',
    '망향비빔국수 본점',
    '경기 연천군 청산면 궁평로 5',
    '031-835-3575',
    38.023877838277,
    127.109300275306,
    'http://place.map.kakao.com/1890069478'
  ),
  (
    '김앤김',
    '경기 안산시 단원구 대선로 384',
    '031-888-6589',
    37.2398485237274,
    126.573017044657,
    'kakao',
    '21481419',
    '김앤김',
    '경기 안산시 단원구 대선로 384',
    '031-888-6589',
    37.239848976280435,
    126.57301760559676,
    'http://place.map.kakao.com/21481419'
  ),
  (
    '거북이횟집곰치국',
    '강원 동해시 일출로 177',
    '033-534-2733',
    37.5582817992179,
    129.120839649944,
    'kakao',
    '107439068',
    '거북이횟집곰치국',
    '강원 동해시 일출로 177',
    '033-534-2733',
    37.55830142768242,
    129.12082515658417,
    'http://place.map.kakao.com/107439068'
  );

update deregister_four_restaurants_20260824 target
set
  place_id = place.id,
  previous_state = jsonb_build_object(
    'name', place.name,
    'address', place.address,
    'approved', place.approved,
    'deleted_at', place.deleted_at,
    'relevance_status', place.relevance_status,
    'operational_status', place.operational_status,
    'is_curation_protected', place.is_curation_protected,
    'last_verified_at', place.last_verified_at,
    'next_verification_at', place.next_verification_at
  )
from public.places place
where place.name = target.expected_name
  and place.address = target.expected_address;

do $$
declare
  mismatch_count integer;
begin
  if (select count(*) from deregister_four_restaurants_20260824 where place_id is not null) <> 4 then
    raise exception '등록 해제 대상을 정확히 4곳 식별하지 못했습니다.';
  end if;

  perform place.id
  from public.places place
  join deregister_four_restaurants_20260824 target on target.place_id = place.id
  order by place.id
  for update;

  select count(*)
  into mismatch_count
  from deregister_four_restaurants_20260824 target
  join public.places place on place.id = target.place_id
  where place.name <> target.expected_name
     or place.address <> target.expected_address
     or place.phone is distinct from target.expected_phone
     or place.category <> 'restaurant'
     or place.approved is not true
     or place.deleted_at is not null
     or place.relevance_status <> 'review'
     or place.operational_status <> 'unknown'
     or place.is_curation_protected is not false
     or place.submitted_by is not null
     or place.source_provider is not null
     or place.source_place_id is not null
     or abs(public.st_y(place.location::public.geometry) - target.expected_latitude) > 0.000001
     or abs(public.st_x(place.location::public.geometry) - target.expected_longitude) > 0.000001;

  if mismatch_count <> 0 then
    raise exception '등록 해제 대상의 현재 상태가 검증 스냅샷과 다릅니다: %곳', mismatch_count;
  end if;

  if exists (
    select 1
    from public.general_places general
    join deregister_four_restaurants_20260824 target
      on general.provider = target.provider
     and general.provider_place_id = target.provider_place_id
  ) then
    raise exception '동일한 카카오 식별자의 일반 장소가 생겨 병합 검토가 필요합니다.';
  end if;

  if exists (
    select 1
    from public.reports report
    where report.target_type = 'place'
      and report.target_id in (
        select place_id from deregister_four_restaurants_20260824
      )
  ) then
    raise exception '일반 장소로 승계할 수 없는 장소 신고가 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference like 'operator-deregister-four-restaurants-20260824:%'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_four_restaurants_reviews_before
on commit drop
as
select review.*
from public.reviews review
where review.place_id in (
  select place_id from deregister_four_restaurants_20260824
);

create temporary table deregister_four_restaurants_favorites_before
on commit drop
as
select favorite.*
from public.favorites favorite
where favorite.place_id in (
  select place_id from deregister_four_restaurants_20260824
);

create temporary table deregister_four_restaurants_rides_before
on commit drop
as
select ride.*
from public.place_rides ride
where ride.place_id in (
  select place_id from deregister_four_restaurants_20260824
);

create temporary table deregister_four_restaurants_votes_before
on commit drop
as
select vote.*
from public.place_rider_fact_votes vote
where vote.place_id in (
  select place_id from deregister_four_restaurants_20260824
);

do $$
begin
  if (select count(*) from deregister_four_restaurants_reviews_before) <> 0
     or (select count(*) from deregister_four_restaurants_favorites_before) <> 0
     or (select count(*) from deregister_four_restaurants_rides_before) <> 0
     or (select count(*) from deregister_four_restaurants_votes_before) <> 0 then
    raise exception '사전 점검 뒤 이용 기록이 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.review_likes review_like
    where review_like.review_id in (
      select id from deregister_four_restaurants_reviews_before
    )
  ) then
    raise exception '사전 점검 뒤 리뷰 좋아요가 생겨 전환을 중단합니다.';
  end if;
end
$$;

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
)
select
  target.provider,
  target.provider_place_id,
  target.general_name,
  target.general_address,
  target.general_latitude,
  target.general_longitude,
  target.general_phone,
  target.place_url,
  null
from deregister_four_restaurants_20260824 target;

update deregister_four_restaurants_20260824 target
set general_place_id = general.id
from public.general_places general
where general.provider = target.provider
  and general.provider_place_id = target.provider_place_id;

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
  'manual_review',
  'relevance_rejected',
  'strong',
  '모토맵 운영자 최종 판단',
  'operator-deregister-four-restaurants-20260824:' || target.place_id::text,
  transaction_timestamp(),
  jsonb_build_object(
    'decision', '등록 장소에서 제외하고 실제 카카오 식별자의 일반 장소로 전환',
    'general_place_identity', jsonb_build_object(
      'id', target.general_place_id,
      'provider', target.provider,
      'provider_place_id', target.provider_place_id,
      'name', target.general_name
    ),
    'hard_delete', false,
    'preserved_reviews', 0,
    'preserved_favorites', 0,
    'preserved_rides', 0,
    'retained_rider_fact_votes', 0,
    'previous_state', target.previous_state
  ),
  'operator-review-20260824'
from deregister_four_restaurants_20260824 target;

update public.places place
set
  deleted_at = transaction_timestamp(),
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = transaction_timestamp(),
  next_verification_at = null
from deregister_four_restaurants_20260824 target
where place.id = target.place_id;

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
  place.id,
  evidence.id,
  'soft_hide',
  '운영자 승인으로 일반 음식점을 등록 장소에서 제외하고 일반 장소로 전환함',
  target.previous_state,
  jsonb_build_object(
    'name', place.name,
    'address', place.address,
    'approved', place.approved,
    'deleted_at', place.deleted_at,
    'relevance_status', place.relevance_status,
    'operational_status', place.operational_status,
    'is_curation_protected', place.is_curation_protected,
    'last_verified_at', place.last_verified_at,
    'next_verification_at', place.next_verification_at,
    'general_place_id', target.general_place_id
  ),
  'operator-review-20260824'
from deregister_four_restaurants_20260824 target
join public.places place on place.id = target.place_id
join public.place_curation_evidence evidence
  on evidence.place_id = target.place_id
 and evidence.source_reference =
   'operator-deregister-four-restaurants-20260824:' || target.place_id::text;

do $$
begin
  if exists (
    select 1
    from deregister_four_restaurants_20260824 target
    left join public.places place on place.id = target.place_id
    left join public.general_places general on general.id = target.general_place_id
    where place.deleted_at is null
       or place.relevance_status <> 'excluded'
       or place.operational_status <> 'unknown'
       or place.is_curation_protected is not false
       or general.id is null
       or general.provider <> target.provider
       or general.provider_place_id <> target.provider_place_id
       or general.name <> target.general_name
       or general.address <> target.general_address
       or general.phone is distinct from target.general_phone
       or abs(general.latitude - target.general_latitude) > 0.000001
       or abs(general.longitude - target.general_longitude) > 0.000001
       or general.place_url <> target.place_url
       or general.promoted_place_id is not null
       or general.review_count <> 0
       or general.rating <> 0
       or general.share_count <> 0
       or not exists (
         select 1
         from public.place_curation_evidence evidence
         where evidence.place_id = target.place_id
           and evidence.source_reference =
             'operator-deregister-four-restaurants-20260824:' || target.place_id::text
       )
       or not exists (
         select 1
         from public.place_curation_actions action
         join public.place_curation_evidence evidence on evidence.id = action.evidence_id
         where action.place_id = target.place_id
           and action.action_type = 'soft_hide'
           and evidence.source_reference =
             'operator-deregister-four-restaurants-20260824:' || target.place_id::text
       )
  ) then
    raise exception '등록 해제의 장소 상태·일반 장소·감사 이력 검증에 실패했습니다.';
  end if;

  if exists (
    select 1 from public.reviews
    where place_id in (select place_id from deregister_four_restaurants_20260824)
  ) or exists (
    select 1 from public.favorites
    where place_id in (select place_id from deregister_four_restaurants_20260824)
  ) or exists (
    select 1 from public.place_rides
    where place_id in (select place_id from deregister_four_restaurants_20260824)
  ) or exists (
    select 1 from public.place_rider_fact_votes
    where place_id in (select place_id from deregister_four_restaurants_20260824)
  ) then
    raise exception '사전 검증에 없던 이용 기록이 대상 장소에 남았습니다.';
  end if;

  if (select count(*) from public.place_curation_evidence
      where source_reference like 'operator-deregister-four-restaurants-20260824:%') <> 4 then
    raise exception '등록 해제 근거 기록 수가 올바르지 않습니다.';
  end if;

  if (
    select count(*)
    from public.place_curation_actions action
    join public.place_curation_evidence evidence on evidence.id = action.evidence_id
    where evidence.source_reference like 'operator-deregister-four-restaurants-20260824:%'
      and action.action_type = 'soft_hide'
  ) <> 4 then
    raise exception '등록 해제 조치 기록 수가 올바르지 않습니다.';
  end if;
end
$$;

commit;
