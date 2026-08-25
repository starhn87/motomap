-- 운영자 판단으로 아유스페이스, 하우스베이커리, 소양강스카이워크를 등록 장소에서 제외한다.
-- 실제 카카오 장소 식별자의 일반 장소로 전환하고, 지원되는 이용 기록은 행 ID를 유지해 승계한다.
-- 일반 장소 모델이 없는 라이더 정보 투표는 숨긴 원래 장소에 보존한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table deregister_places_20260825_three (
  place_id uuid primary key,
  expected_name text unique not null,
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
  expected_review_likes integer not null,
  general_place_id uuid unique,
  previous_state jsonb
) on commit drop;

insert into deregister_places_20260825_three (
  place_id,
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
  expected_votes,
  expected_review_likes
) values
  (
    'cdebb213-9247-442e-bbb2-ed9272fb4d81',
    '아유스페이스',
    '경기 남양주시 화도읍 북한강로1462번길 71',
    '031-516-6200',
    'cafe',
    37.63582,
    127.35813,
    'review',
    false,
    'kakao',
    '2109866070',
    '아유스페이스 남양주지점',
    '경기 남양주시 화도읍 북한강로1462번길 71',
    '031-516-6200',
    37.6358508108893,
    127.35812211495981,
    'http://place.map.kakao.com/2109866070',
    0,
    0,
    0,
    0,
    0
  ),
  (
    'ab9278e5-1608-4642-8e11-4c29ec159d7c',
    '하우스베이커리',
    '경기 양평군 서종면 북한강로 684',
    '031-772-8333',
    'cafe',
    37.59881,
    127.35329,
    'review',
    false,
    'kakao',
    '2043650820',
    '하우스베이커리',
    '경기 양평군 서종면 북한강로 684',
    '031-772-8333',
    37.5987926228055,
    127.353282392832,
    'http://place.map.kakao.com/2043650820',
    1,
    0,
    0,
    2,
    0
  ),
  (
    'e0c85dda-51d5-4afb-9a6a-063db0bcab9c',
    '소양강스카이워크',
    '강원 춘천시 영서로 2663',
    '033-240-1695',
    'viewpoint',
    37.89334,
    127.72341,
    'review',
    false,
    'kakao',
    '1323084049',
    '소양강스카이워크',
    '강원 춘천시 영서로 2663',
    '033-240-1695',
    37.89327760440946,
    127.72366385956643,
    'http://place.map.kakao.com/1323084049',
    0,
    0,
    0,
    0,
    0
  );

update deregister_places_20260825_three target
set previous_state = jsonb_build_object(
  'name', place.name,
  'address', place.address,
  'approved', place.approved,
  'deleted_at', place.deleted_at,
  'relevance_status', place.relevance_status,
  'operational_status', place.operational_status,
  'is_curation_protected', place.is_curation_protected,
  'last_verified_at', place.last_verified_at,
  'next_verification_at', place.next_verification_at,
  'source_provider', place.source_provider,
  'source_place_id', place.source_place_id
)
from public.places place
where place.id = target.place_id;

do $$
declare
  mismatch_count integer;
  allowed_user_ids constant uuid[] := array[
    '28ce059b-4689-4109-aa05-dc2ea3f95011'::uuid,
    '3cd44c12-bbf8-4e7e-9d3c-d0f3b0280ed7'::uuid,
    '877ba1fd-4acd-4af1-b7c5-8df4c8397f33'::uuid
  ];
begin
  if (select count(*) from deregister_places_20260825_three where previous_state is not null) <> 3 then
    raise exception '등록 해제 대상을 정확히 3곳 식별하지 못했습니다.';
  end if;

  perform place.id
  from public.places place
  join deregister_places_20260825_three target on target.place_id = place.id
  order by place.id
  for update;

  select count(*)
  into mismatch_count
  from deregister_places_20260825_three target
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
    join deregister_places_20260825_three target
      on general.provider = target.provider
     and general.provider_place_id = target.provider_place_id
  ) then
    raise exception '동일한 카카오 식별자의 일반 장소가 생겨 병합 검토가 필요합니다.';
  end if;

  if exists (
    select 1
    from public.reports report
    where report.target_type = 'place'
      and report.target_id in (select place_id from deregister_places_20260825_three)
  ) then
    raise exception '일반 장소로 승계할 수 없는 장소 신고가 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1 from public.riding_guide_stops stop
    where stop.place_id in (select place_id from deregister_places_20260825_three)
  ) or exists (
    select 1 from public.riding_guide_submission_stops stop
    where stop.place_id in (select place_id from deregister_places_20260825_three)
  ) then
    raise exception '라이딩 추천 연결이 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1 from public.reviews review
    where review.place_id in (select place_id from deregister_places_20260825_three)
      and (review.user_id is null or review.user_id <> all(allowed_user_ids))
  ) or exists (
    select 1 from public.favorites favorite
    where favorite.place_id in (select place_id from deregister_places_20260825_three)
      and (favorite.user_id is null or favorite.user_id <> all(allowed_user_ids))
  ) or exists (
    select 1 from public.place_rides ride
    where ride.place_id in (select place_id from deregister_places_20260825_three)
      and (ride.user_id is null or ride.user_id <> all(allowed_user_ids))
  ) or exists (
    select 1 from public.place_rider_fact_votes vote
    where vote.place_id in (select place_id from deregister_places_20260825_three)
      and (vote.user_id is null or vote.user_id <> all(allowed_user_ids))
  ) or exists (
    select 1
    from public.review_likes review_like
    join public.reviews review on review.id = review_like.review_id
    where review.place_id in (select place_id from deregister_places_20260825_three)
      and (review_like.user_id is null or review_like.user_id <> all(allowed_user_ids))
  ) then
    raise exception '다른 실제 이용자의 연결 기록이 생겨 전환을 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference like 'operator-deregister-three-20260825:%'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_reviews_20260825_three_before
on commit drop
as
select review.*
from public.reviews review
where review.place_id in (select place_id from deregister_places_20260825_three);

create temporary table deregister_favorites_20260825_three_before
on commit drop
as
select favorite.*
from public.favorites favorite
where favorite.place_id in (select place_id from deregister_places_20260825_three);

create temporary table deregister_rides_20260825_three_before
on commit drop
as
select ride.*
from public.place_rides ride
where ride.place_id in (select place_id from deregister_places_20260825_three);

create temporary table deregister_votes_20260825_three_before
on commit drop
as
select vote.*
from public.place_rider_fact_votes vote
where vote.place_id in (select place_id from deregister_places_20260825_three);

create temporary table deregister_review_likes_20260825_three_before
on commit drop
as
select review_like.*
from public.review_likes review_like
join public.reviews review on review.id = review_like.review_id
where review.place_id in (select place_id from deregister_places_20260825_three);

do $$
begin
  if exists (
    select 1
    from deregister_places_20260825_three target
    where (select count(*) from deregister_reviews_20260825_three_before review
           where review.place_id = target.place_id) <> target.expected_reviews
       or (select count(*) from deregister_favorites_20260825_three_before favorite
           where favorite.place_id = target.place_id) <> target.expected_favorites
       or (select count(*) from deregister_rides_20260825_three_before ride
           where ride.place_id = target.place_id) <> target.expected_rides
       or (select count(*) from deregister_votes_20260825_three_before vote
           where vote.place_id = target.place_id) <> target.expected_votes
       or (select count(*)
           from deregister_review_likes_20260825_three_before review_like
           join deregister_reviews_20260825_three_before review
             on review.id = review_like.review_id
           where review.place_id = target.place_id) <> target.expected_review_likes
  ) then
    raise exception '전환 대상의 이용 기록 수가 검증 스냅샷과 다릅니다.';
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
from deregister_places_20260825_three target;

update deregister_places_20260825_three target
set general_place_id = general.id
from public.general_places general
where general.provider = target.provider
  and general.provider_place_id = target.provider_place_id;

do $$
begin
  if (select count(*) from deregister_places_20260825_three where general_place_id is not null) <> 3 then
    raise exception '일반 장소 식별자를 정확히 3곳 확보하지 못했습니다.';
  end if;
end
$$;

update public.reviews review
set
  place_id = null,
  general_place_id = target.general_place_id
from deregister_places_20260825_three target
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
from deregister_places_20260825_three target
where favorite.place_id = target.place_id;

update public.place_rides ride
set
  place_id = null,
  general_place_id = target.general_place_id,
  name = target.general_name,
  address = target.general_address,
  latitude = target.general_latitude,
  longitude = target.general_longitude
from deregister_places_20260825_three target
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
  'operator-deregister-three-20260825:' || target.place_id::text,
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
    'preserved_reviews', target.expected_reviews,
    'preserved_favorites', target.expected_favorites,
    'preserved_rides', target.expected_rides,
    'retained_rider_fact_votes', target.expected_votes,
    'preserved_review_likes', target.expected_review_likes,
    'previous_state', target.previous_state
  ),
  'operator-review-20260825'
from deregister_places_20260825_three target;

update public.places place
set
  deleted_at = transaction_timestamp(),
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = transaction_timestamp(),
  next_verification_at = null
from deregister_places_20260825_three target
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
  '운영자 승인으로 등록 장소에서 제외하고 일반 장소로 전환함',
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
  'operator-review-20260825'
from deregister_places_20260825_three target
join public.places place on place.id = target.place_id
join public.place_curation_evidence evidence
  on evidence.place_id = target.place_id
 and evidence.source_reference = 'operator-deregister-three-20260825:' || target.place_id::text;

do $$
declare
  hidden_count integer;
  general_count integer;
  evidence_count integer;
  action_count integer;
begin
  select count(*) into hidden_count
  from public.places place
  where place.id in (select place_id from deregister_places_20260825_three)
    and place.approved is true
    and place.deleted_at is not null
    and place.relevance_status = 'excluded'
    and place.operational_status = 'unknown'
    and place.is_curation_protected is false;

  select count(*) into general_count
  from deregister_places_20260825_three target
  join public.general_places general
    on general.id = target.general_place_id
   and general.provider = target.provider
   and general.provider_place_id = target.provider_place_id
   and general.name = target.general_name
   and general.address = target.general_address
   and general.phone is not distinct from target.general_phone
   and abs(general.latitude - target.general_latitude) <= 0.000001
   and abs(general.longitude - target.general_longitude) <= 0.000001
   and general.place_url = target.place_url
   and general.promoted_place_id is null;

  select count(*) into evidence_count
  from public.place_curation_evidence evidence
  where evidence.source_reference like 'operator-deregister-three-20260825:%';

  select count(*) into action_count
  from public.place_curation_actions action
  join public.place_curation_evidence evidence on evidence.id = action.evidence_id
  where evidence.source_reference like 'operator-deregister-three-20260825:%'
    and action.action_type = 'soft_hide';

  if hidden_count <> 3 or general_count <> 3 or evidence_count <> 3 or action_count <> 3 then
    raise exception '등록 해제 사후 검증 실패: hidden %, general %, evidence %, actions %',
      hidden_count, general_count, evidence_count, action_count;
  end if;

  if exists (
    select 1 from public.reviews
    where place_id in (select place_id from deregister_places_20260825_three)
  ) or exists (
    select 1 from public.favorites
    where place_id in (select place_id from deregister_places_20260825_three)
  ) or exists (
    select 1 from public.place_rides
    where place_id in (select place_id from deregister_places_20260825_three)
  ) then
    raise exception '지원되는 이용 기록 일부가 숨긴 등록 장소에 남았습니다.';
  end if;

  if exists (
    select 1
    from deregister_reviews_20260825_three_before snapshot
    left join public.reviews review on review.id = snapshot.id
    left join deregister_places_20260825_three target on target.place_id = snapshot.place_id
    where review.id is null
       or review.place_id is not null
       or review.general_place_id is distinct from target.general_place_id
       or (to_jsonb(review) - array['place_id', 'general_place_id'])
          is distinct from
          (to_jsonb(snapshot) - array['place_id', 'general_place_id'])
  ) then
    raise exception '리뷰 행 또는 일반 장소 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_favorites_20260825_three_before snapshot
    left join public.favorites favorite on favorite.id = snapshot.id
    left join deregister_places_20260825_three target on target.place_id = snapshot.place_id
    where favorite.id is null
       or favorite.user_id <> snapshot.user_id
       or favorite.place_id is not null
       or favorite.general_place_id is distinct from target.general_place_id
       or favorite.name <> target.general_name
       or favorite.address <> target.general_address
       or abs(favorite.latitude - target.general_latitude) > 0.000001
       or abs(favorite.longitude - target.general_longitude) > 0.000001
       or favorite.phone is distinct from target.general_phone
  ) then
    raise exception '즐겨찾기 행 또는 장소 스냅샷 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_rides_20260825_three_before snapshot
    left join public.place_rides ride on ride.id = snapshot.id
    left join deregister_places_20260825_three target on target.place_id = snapshot.place_id
    where ride.id is null
       or ride.user_id <> snapshot.user_id
       or ride.place_id is not null
       or ride.general_place_id is distinct from target.general_place_id
       or ride.name <> target.general_name
       or ride.address <> target.general_address
       or abs(ride.latitude - target.general_latitude) > 0.000001
       or abs(ride.longitude - target.general_longitude) > 0.000001
  ) then
    raise exception '주행 행 또는 장소 스냅샷 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_votes_20260825_three_before snapshot
    left join public.place_rider_fact_votes vote
      on vote.place_id = snapshot.place_id
     and vote.user_id = snapshot.user_id
     and vote.fact_code = snapshot.fact_code
    where vote.place_id is null
       or to_jsonb(vote) is distinct from to_jsonb(snapshot)
  ) then
    raise exception '라이더 정보 투표 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_review_likes_20260825_three_before snapshot
    left join public.review_likes review_like
      on review_like.review_id = snapshot.review_id
     and review_like.user_id = snapshot.user_id
    where review_like.review_id is null
       or to_jsonb(review_like) is distinct from to_jsonb(snapshot)
  ) then
    raise exception '리뷰 좋아요 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_places_20260825_three target
    join public.general_places general on general.id = target.general_place_id
    where general.review_count <> (
      select count(*) from public.reviews review
      where review.general_place_id = general.id
    )
  ) then
    raise exception '일반 장소 리뷰 집계 검증에 실패했습니다.';
  end if;
end
$$;

commit;
