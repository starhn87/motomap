-- 운영자 판단으로 핏제리아 루카네와 금학칼국수를 일반 장소로 전환한다.
-- 실제 카카오 장소 식별자를 사용하고 리뷰·즐겨찾기·주행 행은 그대로 승계한다.
-- 일반 장소 모델이 없는 라이더 정보 투표는 숨긴 등록 장소에 보존한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table deregister_places_20260824_strict (
  expected_name text primary key,
  expected_address text not null,
  expected_phone text,
  expected_category text not null,
  expected_latitude double precision not null,
  expected_longitude double precision not null,
  expected_relevance_status text not null,
  expected_is_curation_protected boolean not null,
  provider text not null,
  provider_place_id text unique not null,
  general_name text not null,
  general_address text not null,
  general_phone text,
  general_latitude double precision not null,
  general_longitude double precision not null,
  place_url text not null,
  expected_reviews integer not null,
  expected_favorites integer not null,
  expected_rides integer not null,
  expected_votes integer not null,
  place_id uuid unique,
  general_place_id uuid unique,
  previous_state jsonb
) on commit drop;

insert into deregister_places_20260824_strict (
  expected_name,
  expected_address,
  expected_phone,
  expected_category,
  expected_latitude,
  expected_longitude,
  expected_relevance_status,
  expected_is_curation_protected,
  provider,
  provider_place_id,
  general_name,
  general_address,
  general_phone,
  general_latitude,
  general_longitude,
  place_url,
  expected_reviews,
  expected_favorites,
  expected_rides,
  expected_votes
) values
  (
    '핏제리아 루카네',
    '경기 양평군 강상면 강남로 802',
    '031-772-3589',
    'restaurant',
    37.49136,
    127.46701,
    'review',
    false,
    'kakao',
    '956660667',
    '핏제리아루카네',
    '경기 양평군 강상면 강남로 802',
    '031-772-3589',
    37.49135421042501,
    127.46701059667572,
    'http://place.map.kakao.com/956660667',
    1,
    0,
    0,
    3
  ),
  (
    '금학칼국수',
    '강원 평창군 봉평면 기풍로 166-1',
    '033-335-1777',
    'restaurant',
    37.61722,
    128.37728,
    'trusted',
    true,
    'kakao',
    '16528567',
    '금학칼국수',
    '강원 평창군 봉평면 기풍로 166-1',
    '033-335-1777',
    37.6171809900797,
    128.377281825268,
    'http://place.map.kakao.com/16528567',
    1,
    1,
    1,
    0
  );

update deregister_places_20260824_strict target
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
  if (select count(*) from deregister_places_20260824_strict where place_id is not null) <> 2 then
    raise exception '등록 해제 대상을 정확히 2곳 식별하지 못했습니다.';
  end if;

  perform place.id
  from public.places place
  join deregister_places_20260824_strict target on target.place_id = place.id
  order by place.id
  for update;

  select count(*)
  into mismatch_count
  from deregister_places_20260824_strict target
  join public.places place on place.id = target.place_id
  where place.name <> target.expected_name
     or place.address <> target.expected_address
     or place.phone is distinct from target.expected_phone
     or place.category <> target.expected_category
     or place.approved is not true
     or place.deleted_at is not null
     or place.relevance_status <> target.expected_relevance_status
     or place.operational_status <> 'unknown'
     or place.is_curation_protected <> target.expected_is_curation_protected
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
    join deregister_places_20260824_strict target
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
        select place_id from deregister_places_20260824_strict
      )
  ) then
    raise exception '일반 장소로 승계할 수 없는 장소 신고가 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference like 'operator-strict-deregister-20260824:%'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_reviews_20260824_strict_before
on commit drop
as
select review.*
from public.reviews review
where review.place_id in (
  select place_id from deregister_places_20260824_strict
);

create temporary table deregister_favorites_20260824_strict_before
on commit drop
as
select favorite.*
from public.favorites favorite
where favorite.place_id in (
  select place_id from deregister_places_20260824_strict
);

create temporary table deregister_rides_20260824_strict_before
on commit drop
as
select ride.*
from public.place_rides ride
where ride.place_id in (
  select place_id from deregister_places_20260824_strict
);

create temporary table deregister_votes_20260824_strict_before
on commit drop
as
select vote.*
from public.place_rider_fact_votes vote
where vote.place_id in (
  select place_id from deregister_places_20260824_strict
);

do $$
begin
  if exists (
    select 1
    from deregister_places_20260824_strict target
    where (select count(*) from deregister_reviews_20260824_strict_before review where review.place_id = target.place_id)
          <> target.expected_reviews
       or (select count(*) from deregister_favorites_20260824_strict_before favorite where favorite.place_id = target.place_id)
          <> target.expected_favorites
       or (select count(*) from deregister_rides_20260824_strict_before ride where ride.place_id = target.place_id)
          <> target.expected_rides
       or (select count(*) from deregister_votes_20260824_strict_before vote where vote.place_id = target.place_id)
          <> target.expected_votes
  ) then
    raise exception '전환 대상의 이용 기록 수가 검증 스냅샷과 다릅니다.';
  end if;

  if exists (
    select 1
    from (
      select user_id from deregister_reviews_20260824_strict_before
      union all
      select user_id from deregister_favorites_20260824_strict_before
      union all
      select user_id from deregister_rides_20260824_strict_before
      union all
      select user_id from deregister_votes_20260824_strict_before
    ) connected
    where connected.user_id <> all(array[
      '28ce059b-4689-4109-aa05-dc2ea3f95011'::uuid,
      '3cd44c12-bbf8-4e7e-9d3c-d0f3b0280ed7'::uuid,
      '877ba1fd-4acd-4af1-b7c5-8df4c8397f33'::uuid
    ])
  ) then
    raise exception '다른 실제 이용자의 연결 기록이 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.review_likes review_like
    where review_like.review_id in (
      select id from deregister_reviews_20260824_strict_before
    )
  ) then
    raise exception '사전 검증에 없던 리뷰 좋아요가 생겨 전환을 중단합니다.';
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
from deregister_places_20260824_strict target;

update deregister_places_20260824_strict target
set general_place_id = general.id
from public.general_places general
where general.provider = target.provider
  and general.provider_place_id = target.provider_place_id;

update public.reviews review
set
  place_id = null,
  general_place_id = target.general_place_id
from deregister_places_20260824_strict target
where review.place_id = target.place_id;

update public.favorites favorite
set
  place_id = null,
  general_place_id = target.general_place_id,
  name = target.general_name,
  address = target.general_address,
  latitude = target.general_latitude,
  longitude = target.general_longitude,
  phone = target.general_phone
from deregister_places_20260824_strict target
where favorite.place_id = target.place_id;

update public.place_rides ride
set
  place_id = null,
  general_place_id = target.general_place_id,
  name = target.general_name,
  address = target.general_address,
  latitude = target.general_latitude,
  longitude = target.general_longitude
from deregister_places_20260824_strict target
where ride.place_id = target.place_id;

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
  'operator-strict-deregister-20260824:' || target.place_id::text,
  transaction_timestamp(),
  jsonb_build_object(
    'decision', '엄격한 등록 장소 기준에 따라 일반 장소로 전환',
    'general_place_identity', jsonb_build_object(
      'id', target.general_place_id,
      'provider', target.provider,
      'provider_place_id', target.provider_place_id,
      'name', target.general_name
    ),
    'hard_delete', false,
    'explicit_operator_override_of_protection', target.expected_is_curation_protected,
    'preserved_reviews', target.expected_reviews,
    'preserved_favorites', target.expected_favorites,
    'preserved_rides', target.expected_rides,
    'retained_rider_fact_votes', target.expected_votes,
    'previous_state', target.previous_state
  ),
  'operator-review-20260824'
from deregister_places_20260824_strict target;

update public.places place
set
  deleted_at = transaction_timestamp(),
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = transaction_timestamp(),
  next_verification_at = null
from deregister_places_20260824_strict target
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
  '엄격한 등록 장소 기준에 따라 일반 장소로 전환하고 지원되는 이용 기록을 보존함',
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
from deregister_places_20260824_strict target
join public.places place on place.id = target.place_id
join public.place_curation_evidence evidence
  on evidence.place_id = target.place_id
 and evidence.source_reference = 'operator-strict-deregister-20260824:' || target.place_id::text;

do $$
begin
  if exists (
    select 1
    from deregister_places_20260824_strict target
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
       or general.review_count <> target.expected_reviews
       or not exists (
         select 1
         from public.place_curation_evidence evidence
         where evidence.place_id = target.place_id
           and evidence.source_reference = 'operator-strict-deregister-20260824:' || target.place_id::text
       )
       or not exists (
         select 1
         from public.place_curation_actions action
         join public.place_curation_evidence evidence on evidence.id = action.evidence_id
         where action.place_id = target.place_id
           and action.action_type = 'soft_hide'
           and evidence.source_reference = 'operator-strict-deregister-20260824:' || target.place_id::text
       )
  ) then
    raise exception '등록 해제의 장소 상태 또는 감사 이력 검증에 실패했습니다.';
  end if;

  if exists (
    select 1 from public.reviews
    where place_id in (select place_id from deregister_places_20260824_strict)
  ) or exists (
    select 1 from public.favorites
    where place_id in (select place_id from deregister_places_20260824_strict)
  ) or exists (
    select 1 from public.place_rides
    where place_id in (select place_id from deregister_places_20260824_strict)
  ) then
    raise exception '지원되는 이용 기록 일부가 숨긴 등록 장소에 남았습니다.';
  end if;

  if exists (
    select 1
    from deregister_reviews_20260824_strict_before snapshot
    left join deregister_places_20260824_strict target on target.place_id = snapshot.place_id
    left join public.reviews review on review.id = snapshot.id
    where review.id is null
       or review.user_id <> snapshot.user_id
       or review.place_id is not null
       or review.general_place_id is distinct from target.general_place_id
       or review.rating <> snapshot.rating
       or review.content is distinct from snapshot.content
       or review.photos is distinct from snapshot.photos
       or review.created_at <> snapshot.created_at
  ) then
    raise exception '리뷰 내용 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_favorites_20260824_strict_before snapshot
    left join deregister_places_20260824_strict target on target.place_id = snapshot.place_id
    left join public.favorites favorite on favorite.id = snapshot.id
    where favorite.id is null
       or favorite.user_id <> snapshot.user_id
       or favorite.place_id is not null
       or favorite.general_place_id is distinct from target.general_place_id
       or favorite.created_at <> snapshot.created_at
  ) then
    raise exception '즐겨찾기 행 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_rides_20260824_strict_before snapshot
    left join deregister_places_20260824_strict target on target.place_id = snapshot.place_id
    left join public.place_rides ride on ride.id = snapshot.id
    where ride.id is null
       or ride.user_id <> snapshot.user_id
       or ride.place_id is not null
       or ride.general_place_id is distinct from target.general_place_id
       or ride.created_at <> snapshot.created_at
  ) then
    raise exception '주행 행 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_votes_20260824_strict_before snapshot
    left join public.place_rider_fact_votes vote
      on vote.place_id = snapshot.place_id
     and vote.user_id = snapshot.user_id
     and vote.fact_code = snapshot.fact_code
    where vote.place_id is null
       or vote.created_at <> snapshot.created_at
  ) then
    raise exception '라이더 정보 투표 보존 검증에 실패했습니다.';
  end if;
end
$$;

commit;
