-- 광역자치단체 정식명과 앱의 축약형 차이만 보고한 기존 검토를 장소 변경 없이 종료한다.
-- 이후 감지는 Edge Function에서 같은 축약표를 적용하므로 같은 오탐을 다시 만들지 않는다.

begin;

set local statement_timeout = '120s';

create temporary table province_alias_reviews_20260823 (
  id uuid primary key,
  place_id uuid not null,
  current_address text not null,
  observed_address text not null
) on commit drop;

insert into province_alias_reviews_20260823 (
  id, place_id, current_address, observed_address
) values
  ('fde17b91-858a-4370-b764-0abcc2e24caf', '3b947334-85d0-4385-81e1-936a7f67c273',
   '강원 동해시 일출로 177', '강원특별자치도 동해시 일출로 177'),
  ('46994cab-34f2-4a4f-92aa-42041e0a8025', '317be3b4-4747-4a28-bc83-6b8be1ad6f32',
   '강원 원주시 지정면 간현리 산 116-1', '강원특별자치도 원주시 지정면 간현리 산 116-1'),
  ('64af381c-0972-484e-bca0-de5e29903ae2', '2d4a9b18-ff8f-43a7-88be-05864fad5e91',
   '강원 동해시 삼화로 467', '강원특별자치도 동해시 삼화로 467'),
  ('b2824897-7329-4b3b-92cc-b578285af057', '2240f6cd-2ea4-4b79-b183-0d9c2f9804bb',
   '제주 제주시 천수로 12', '제주특별자치도 제주시 천수로 12');

do $$
declare
  mismatch_count integer;
begin
  select count(*)
  into mismatch_count
  from province_alias_reviews_20260823 expected
  left join public.place_change_reviews review on review.id = expected.id
  where review.id is null
     or review.place_id <> expected.place_id
     or review.change_types <> array['address_changed']::text[]
     or review.current_snapshot ->> 'address' <> expected.current_address
     or review.observed_snapshot ->> 'address' <> expected.observed_address
     or review.status not in ('pending', 'dismissed');

  if mismatch_count <> 0 then
    raise exception '광역 명칭 오탐 검토 상태가 예상과 다릅니다: %건', mismatch_count;
  end if;
end
$$;

update public.place_change_reviews review
set
  status = 'dismissed',
  reviewed_at = coalesce(review.reviewed_at, '2026-08-23T00:30:00Z'::timestamptz),
  resolution_note = coalesce(
    review.resolution_note,
    '광역자치단체 정식명과 앱 축약형만 다른 주소 정규화 오탐으로 종료'
  )
from province_alias_reviews_20260823 expected
where review.id = expected.id
  and review.status = 'pending';

update public.place_change_monitor_state state
set
  last_result = 'clean',
  last_error = null,
  consecutive_failures = 0,
  next_check_at = '2026-08-23T00:30:00Z'::timestamptz + case
    when place.is_curation_protected
      or place.category in ('viewpoint', 'rest_stop', 'camping')
      then interval '90 days'
    else interval '30 days'
  end,
  updated_at = '2026-08-23T00:30:00Z'::timestamptz
from province_alias_reviews_20260823 expected
join public.places place on place.id = expected.place_id
where state.place_id = expected.place_id;

commit;
