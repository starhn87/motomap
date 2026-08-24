-- 운영자 판단으로 고구려돼지갈비와 왈츠와닥터만을 일반 장소로 전환한다.
-- 리뷰·즐겨찾기·주행은 행 ID와 내용을 유지한 채 일반 장소 대상으로 옮기고,
-- 일반 장소 모델이 없는 라이더 정보 투표는 숨긴 원래 장소에 보존한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table deregister_places_20260824 (
  id uuid primary key,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  phone text,
  relevance_status text not null,
  is_curation_protected boolean not null
) on commit drop;

insert into deregister_places_20260824 (
  id,
  name,
  address,
  latitude,
  longitude,
  phone,
  relevance_status,
  is_curation_protected
) values
  (
    'ea91be84-c45a-4c6f-a859-fcb8e561817b',
    '고구려돼지갈비',
    '경기 광주시 양촌길 145',
    37.3709,
    127.25013,
    '031-766-5595',
    'trusted',
    true
  ),
  (
    '6950d68f-35f4-49c5-8406-8099cc755819',
    '왈츠와닥터만',
    '경기 남양주시 조안면 북한강로 856-37',
    37.59182,
    127.33829,
    '031-576-0020',
    'review',
    false
  );

do $$
declare
  mismatch_count integer;
begin
  perform place.id
  from public.places place
  join deregister_places_20260824 target on target.id = place.id
  order by place.id
  for update;

  select count(*)
  into mismatch_count
  from deregister_places_20260824 target
  left join public.places place on place.id = target.id
  where place.id is null
     or place.name <> target.name
     or place.address <> target.address
     or place.phone is distinct from target.phone
     or place.approved is not true
     or place.deleted_at is not null
     or place.relevance_status <> target.relevance_status
     or place.operational_status <> 'unknown'
     or place.is_curation_protected <> target.is_curation_protected
     or place.submitted_by is not null
     or place.source_provider is not null
     or place.source_place_id is not null
     or abs(public.st_y(place.location::public.geometry) - target.latitude) > 0.000001
     or abs(public.st_x(place.location::public.geometry) - target.longitude) > 0.000001;

  if mismatch_count <> 0 then
    raise exception '등록 해제 대상의 현재 상태가 검증 스냅샷과 다릅니다: %곳', mismatch_count;
  end if;

  if exists (
    select 1
    from public.reports report
    where report.target_type = 'place'
      and report.target_id in (select id from deregister_places_20260824)
  ) then
    raise exception '일반 장소로 승계할 수 없는 장소 신고가 생겨 등록 해제를 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_rider_fact_votes vote
    where vote.place_id in (select id from deregister_places_20260824)
      and vote.user_id <> all(array[
        '28ce059b-4689-4109-aa05-dc2ea3f95011'::uuid,
        '3cd44c12-bbf8-4e7e-9d3c-d0f3b0280ed7'::uuid,
        '877ba1fd-4acd-4af1-b7c5-8df4c8397f33'::uuid
      ])
  ) then
    raise exception '다른 실제 이용자의 라이더 정보 투표가 생겨 등록 해제를 중단합니다.';
  end if;

  if exists (
    select 1
    from public.place_curation_evidence evidence
    where evidence.source_reference like 'operator-deregister-preserve-20260824:%'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_places_20260824_before
on commit drop
as
select
  target.*,
  left(lower(btrim(target.name)), 150)
    || '|'
    || to_char(round(target.latitude::numeric, 5), 'FM999990.00000')
    || ','
    || to_char(round(target.longitude::numeric, 5), 'FM999990.00000')
    as coordinate_key,
  jsonb_build_object(
    'name', place.name,
    'address', place.address,
    'approved', place.approved,
    'deleted_at', place.deleted_at,
    'relevance_status', place.relevance_status,
    'operational_status', place.operational_status,
    'is_curation_protected', place.is_curation_protected,
    'last_verified_at', place.last_verified_at,
    'next_verification_at', place.next_verification_at
  ) as previous_state
from deregister_places_20260824 target
join public.places place on place.id = target.id;

-- 전환 전 행 ID와 개수를 고정해 전환 후 동일한 기록이 남았는지 검증한다.
create temporary table deregister_reviews_20260824_before
on commit drop
as
select review.id, review.place_id, review.user_id
from public.reviews review
where review.place_id in (select id from deregister_places_20260824);

create temporary table deregister_favorites_20260824_before
on commit drop
as
select favorite.id, favorite.place_id, favorite.user_id
from public.favorites favorite
where favorite.place_id in (select id from deregister_places_20260824);

create temporary table deregister_rides_20260824_before
on commit drop
as
select ride.id, ride.place_id, ride.user_id
from public.place_rides ride
where ride.place_id in (select id from deregister_places_20260824);

create temporary table deregister_votes_20260824_before
on commit drop
as
select vote.place_id, vote.user_id, vote.fact_code, vote.created_at
from public.place_rider_fact_votes vote
where vote.place_id in (select id from deregister_places_20260824);

do $$
begin
  if (select count(*) from deregister_reviews_20260824_before) <> 2
     or (select count(*) from deregister_favorites_20260824_before) <> 1
     or (select count(*) from deregister_rides_20260824_before) <> 0
     or (select count(*) from deregister_votes_20260824_before) <> 2 then
    raise exception '전환 대상의 이용 기록 수가 검증 스냅샷과 다릅니다.';
  end if;

  if exists (
    select 1
    from deregister_places_20260824_before target
    join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
  ) then
    raise exception '전환 대상의 좌표 일반 장소가 새로 생겨 병합 검토가 필요합니다.';
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
  promoted_place_id
)
select
  'coordinate',
  target.coordinate_key,
  target.name,
  target.address,
  target.latitude,
  target.longitude,
  target.phone,
  null
from deregister_places_20260824_before target;

update public.reviews review
set
  place_id = null,
  general_place_id = general.id
from deregister_places_20260824_before target
join public.general_places general
  on general.provider = 'coordinate'
 and general.provider_place_id = target.coordinate_key
where review.place_id = target.id;

update public.favorites favorite
set
  place_id = null,
  general_place_id = general.id,
  name = target.name,
  address = target.address,
  latitude = target.latitude,
  longitude = target.longitude,
  phone = target.phone
from deregister_places_20260824_before target
join public.general_places general
  on general.provider = 'coordinate'
 and general.provider_place_id = target.coordinate_key
where favorite.place_id = target.id;

update public.place_rides ride
set
  place_id = null,
  general_place_id = general.id,
  name = target.name,
  address = target.address,
  latitude = target.latitude,
  longitude = target.longitude
from deregister_places_20260824_before target
join public.general_places general
  on general.provider = 'coordinate'
 and general.provider_place_id = target.coordinate_key
where ride.place_id = target.id;

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
  target.id,
  'manual_review',
  'relevance_rejected',
  'strong',
  '모토맵 운영자 최종 판단',
  'operator-deregister-preserve-20260824:' || target.id::text,
  transaction_timestamp(),
  jsonb_build_object(
    'decision', '모토맵 등록 장소에서 제외하고 일반 장소로 전환',
    'hard_delete', false,
    'preserved_reviews', (
      select count(*) from deregister_reviews_20260824_before review
      where review.place_id = target.id
    ),
    'preserved_favorites', (
      select count(*) from deregister_favorites_20260824_before favorite
      where favorite.place_id = target.id
    ),
    'preserved_rides', (
      select count(*) from deregister_rides_20260824_before ride
      where ride.place_id = target.id
    ),
    'retained_rider_fact_votes', (
      select count(*) from deregister_votes_20260824_before vote
      where vote.place_id = target.id
    ),
    'previous_state', target.previous_state
  ),
  'operator-review-20260824'
from deregister_places_20260824_before target;

update public.places place
set
  deleted_at = transaction_timestamp(),
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = transaction_timestamp(),
  next_verification_at = null
from deregister_places_20260824_before target
where place.id = target.id;

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
  '운영자 승인으로 일반 장소로 전환하고 지원되는 이용 기록을 보존함',
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
    'next_verification_at', place.next_verification_at
  ),
  'operator-review-20260824'
from deregister_places_20260824_before target
join public.places place on place.id = target.id
join public.place_curation_evidence evidence
  on evidence.place_id = target.id
 and evidence.source_reference = 'operator-deregister-preserve-20260824:' || target.id::text;

do $$
declare
  hidden_count integer;
  general_count integer;
  evidence_count integer;
  action_count integer;
begin
  select count(*) into hidden_count
  from public.places
  where id in (select id from deregister_places_20260824)
    and approved is true
    and deleted_at is not null
    and relevance_status = 'excluded'
    and operational_status = 'unknown'
    and is_curation_protected is false;

  select count(*) into general_count
  from deregister_places_20260824_before target
  join public.general_places general
    on general.provider = 'coordinate'
   and general.provider_place_id = target.coordinate_key
   and general.promoted_place_id is null;

  select count(*) into evidence_count
  from public.place_curation_evidence
  where source_reference like 'operator-deregister-preserve-20260824:%';

  select count(*) into action_count
  from public.place_curation_actions action
  join public.place_curation_evidence evidence on evidence.id = action.evidence_id
  where evidence.source_reference like 'operator-deregister-preserve-20260824:%'
    and action.action_type = 'soft_hide';

  if hidden_count <> 2 or general_count <> 2 or evidence_count <> 2 or action_count <> 2 then
    raise exception '등록 해제 사후 검증 실패: hidden %, general %, evidence %, actions %',
      hidden_count, general_count, evidence_count, action_count;
  end if;

  if exists (
    select 1 from public.reviews
    where place_id in (select id from deregister_places_20260824)
  ) or exists (
    select 1 from public.favorites
    where place_id in (select id from deregister_places_20260824)
  ) or exists (
    select 1 from public.place_rides
    where place_id in (select id from deregister_places_20260824)
  ) then
    raise exception '지원되는 이용 기록 일부가 숨긴 등록 장소에 남았습니다.';
  end if;

  if exists (
    select 1
    from deregister_reviews_20260824_before snapshot
    left join public.reviews review on review.id = snapshot.id
    left join deregister_places_20260824_before target on target.id = snapshot.place_id
    left join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
    where review.id is null
       or review.user_id <> snapshot.user_id
       or review.place_id is not null
       or review.general_place_id is distinct from general.id
  ) then
    raise exception '리뷰 ID 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_favorites_20260824_before snapshot
    left join public.favorites favorite on favorite.id = snapshot.id
    left join deregister_places_20260824_before target on target.id = snapshot.place_id
    left join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
    where favorite.id is null
       or favorite.user_id <> snapshot.user_id
       or favorite.place_id is not null
       or favorite.general_place_id is distinct from general.id
  ) then
    raise exception '즐겨찾기 ID 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_rides_20260824_before snapshot
    left join public.place_rides ride on ride.id = snapshot.id
    left join deregister_places_20260824_before target on target.id = snapshot.place_id
    left join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
    where ride.id is null
       or ride.user_id <> snapshot.user_id
       or ride.place_id is not null
       or ride.general_place_id is distinct from general.id
  ) then
    raise exception '주행 ID 또는 대상 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_votes_20260824_before snapshot
    left join public.place_rider_fact_votes vote
      on vote.place_id = snapshot.place_id
     and vote.user_id = snapshot.user_id
     and vote.fact_code = snapshot.fact_code
    where vote.place_id is null
       or vote.created_at <> snapshot.created_at
  ) then
    raise exception '라이더 정보 투표 보존 검증에 실패했습니다.';
  end if;

  if exists (
    select 1
    from deregister_places_20260824_before target
    join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
    where general.review_count <> (
      select count(*) from public.reviews review where review.general_place_id = general.id
    )
  ) then
    raise exception '일반 장소 리뷰 집계 검증에 실패했습니다.';
  end if;
end
$$;

commit;
