-- 운영자가 모토맵 선별 대상에서 제외한 제주 지역 장소 3곳을 복구 가능한 방식으로 숨긴다.
-- 실제 이용자 연결 기록이 적용 직전에 생겼다면 데이터 손상을 막기 위해 중단한다.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table deregister_jeju_places_20260823 (
  id uuid primary key,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  phone text
) on commit drop;

insert into deregister_jeju_places_20260823 (
  id, name, address, latitude, longitude, phone
) values
  (
    '2240f6cd-2ea4-4b79-b183-0d9c2f9804bb',
    '골막식당',
    '제주 제주시 천수로 12',
    33.5024686068256,
    126.538410238903,
    '064-753-6949'
  ),
  (
    'a67ca2bf-03e4-4b1e-9195-67940b119043',
    '산방식당',
    '제주 서귀포시 대정읍 하모이삼로 62',
    33.223362891958,
    126.254198293055,
    '064-794-2165'
  ),
  (
    'ced060c4-3ba6-4670-889d-08bac5ca3063',
    '1100고지 휴게소',
    '제주 서귀포시 1100로 1555',
    33.3578491473629,
    126.46242448237,
    null
  );

do $$
declare
  mismatch_count integer;
  linked_count integer;
begin
  perform place.id
  from public.places place
  join deregister_jeju_places_20260823 target on target.id = place.id
  order by place.id
  for update;

  select count(*)
  into mismatch_count
  from deregister_jeju_places_20260823 target
  left join public.places place on place.id = target.id
  where place.id is null
     or place.name <> target.name
     or place.address <> target.address
     or place.approved is not true
     or place.deleted_at is not null
     or place.relevance_status <> 'review'
     or place.operational_status <> 'unknown'
     or place.is_curation_protected is true
     or place.submitted_by is not null
     or abs(public.st_y(place.location::public.geometry) - target.latitude) > 0.000001
     or abs(public.st_x(place.location::public.geometry) - target.longitude) > 0.000001;

  if mismatch_count <> 0 then
    raise exception '등록 해제 대상의 현재 상태가 검증 스냅샷과 다릅니다: %곳', mismatch_count;
  end if;

  select
    (select count(*) from public.reviews where place_id in (
      select id from deregister_jeju_places_20260823
    ))
    + (select count(*) from public.favorites where place_id in (
      select id from deregister_jeju_places_20260823
    ))
    + (select count(*) from public.place_rides where place_id in (
      select id from deregister_jeju_places_20260823
    ))
    + (select count(*) from public.place_rider_fact_votes where place_id in (
      select id from deregister_jeju_places_20260823
    ))
    + (select count(*) from public.reports where target_type = 'place' and target_id in (
      select id from deregister_jeju_places_20260823
    ))
  into linked_count;

  if linked_count <> 0 then
    raise exception '등록 해제 대상에 새 이용자 연결 기록이 생겼습니다: %건', linked_count;
  end if;

  if exists (
    select 1
    from public.place_curation_evidence
    where source_reference like 'operator-deregister-jeju-20260823:%'
  ) then
    raise exception '같은 운영자 결정을 이미 반영했습니다.';
  end if;
end
$$;

create temporary table deregister_jeju_places_20260823_before
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
from deregister_jeju_places_20260823 target
join public.places place on place.id = target.id;

do $$
begin
  if exists (
    select 1
    from deregister_jeju_places_20260823_before target
    join public.general_places general
      on general.provider = 'coordinate'
     and general.provider_place_id = target.coordinate_key
    where general.promoted_place_id is not null
      and general.promoted_place_id <> target.id
  ) then
    raise exception '일반 장소 식별자가 다른 등록 장소와 충돌합니다.';
  end if;
end
$$;

-- 등록 해제 뒤에도 같은 위치를 일반 장소로 식별할 수 있게 한다.
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
from deregister_jeju_places_20260823_before target
on conflict (provider, provider_place_id) do update
set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  phone = excluded.phone,
  promoted_place_id = null;

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
  'operator-deregister-jeju-20260823:' || target.id::text,
  transaction_timestamp(),
  jsonb_build_object(
    'decision', '모토맵 등록 장소에서 제외하고 일반 장소로 유지',
    'hard_delete', false,
    'preserved_user_records', 0,
    'previous_state', target.previous_state
  ),
  'operator-review-20260823'
from deregister_jeju_places_20260823_before target;

update public.places place
set
  deleted_at = transaction_timestamp(),
  relevance_status = 'excluded',
  is_curation_protected = false,
  last_verified_at = transaction_timestamp(),
  next_verification_at = null
from deregister_jeju_places_20260823_before target
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
  '운영자 승인으로 모토맵 등록 장소에서 제외하고 일반 장소로 유지함',
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
  'operator-review-20260823'
from deregister_jeju_places_20260823_before target
join public.places place on place.id = target.id
join public.place_curation_evidence evidence
  on evidence.place_id = target.id
 and evidence.source_reference = 'operator-deregister-jeju-20260823:' || target.id::text;

do $$
declare
  hidden_count integer;
  general_count integer;
  evidence_count integer;
  action_count integer;
begin
  select count(*) into hidden_count
  from public.places
  where id in (select id from deregister_jeju_places_20260823)
    and approved is true
    and deleted_at is not null
    and relevance_status = 'excluded'
    and operational_status = 'unknown';

  select count(*) into general_count
  from deregister_jeju_places_20260823_before target
  join public.general_places general
    on general.provider = 'coordinate'
   and general.provider_place_id = target.coordinate_key
   and general.promoted_place_id is null;

  select count(*) into evidence_count
  from public.place_curation_evidence
  where source_reference like 'operator-deregister-jeju-20260823:%';

  select count(*) into action_count
  from public.place_curation_actions action
  join public.place_curation_evidence evidence on evidence.id = action.evidence_id
  where evidence.source_reference like 'operator-deregister-jeju-20260823:%'
    and action.action_type = 'soft_hide';

  if hidden_count <> 3 or general_count <> 3 or evidence_count <> 3 or action_count <> 3 then
    raise exception '등록 해제 사후 검증 실패: hidden %, general %, evidence %, actions %',
      hidden_count, general_count, evidence_count, action_count;
  end if;
end
$$;

commit;
