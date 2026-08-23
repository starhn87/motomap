-- 오토캠핑 전수 감사의 운영자 승인 결과를 원자적으로 반영한다.
-- 다섯 곳은 검증 완료로 기록하고, 사이트 옆 바이크 주차를 확인하지 못한 두 곳은
-- 사용자 기록이 없는지 다시 확인한 뒤 소프트 숨김한다.

begin;

set local statement_timeout = '120s';

create temporary table camping_audit_20260823_decisions (
  id uuid primary key,
  name text not null,
  decision text not null,
  source_url text not null,
  evidence_summary text not null
) on commit drop;

insert into camping_audit_20260823_decisions (
  id, name, decision, source_url, evidence_summary
) values
  ('5f934530-655f-4bf3-a98f-e732851d57ae', '높은터캠핑장', 'verify',
   'https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=8167',
   '자동차야영장·오토캠핑 22면을 운영함'),
  ('123ca7ba-ca3d-4c85-8396-843f7fc34043', '덕유대야영장', 'verify',
   'https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=810',
   '덕유대자동차야영장·자동차야영장 69면을 운영함'),
  ('5e6d3b18-c3b9-4872-b419-992c7f1a8e20', '산여울캠핑장', 'verify',
   'https://m.thankqcamping.com/resv/view.hbb?cseq=3553',
   '현재 공식 예약 페이지에서 오토캠핑 사이트를 운영함'),
  ('33acfb21-5f9f-4db9-b7c9-06c696fdd6ea', '자라섬 캠핑장', 'verify',
   'https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=2616',
   '자동차야영장·대표 오토캠핑장으로 운영함'),
  ('1cc1c6d3-ca16-46a4-9361-f54a146d11eb', '합강캠핑장', 'verify',
   'https://www.sjfmc.or.kr/camping/sub01_03_03.do',
   '공식 시설 안내에서 오토캠핑존을 운영함'),
  ('fc36f8a5-75a9-476d-8663-7c676a702022', '모구리야영장', 'hide',
   'https://eticket.seogwipo.go.kr/contents?bmcode=mogu',
   '공식 안내에서 사이트 옆 차량 주차를 확인하지 못해 오토캠핑 기준을 충족하지 않음'),
  ('2d4a9b18-ff8f-43a7-88be-05864fad5e91', '무릉계곡 힐링캠프장', 'hide',
   'https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=1100',
   '데크 사이트와 별도 주차요금만 확인되어 사이트 옆 바이크 주차 근거가 부족함');

do $$
declare
  mismatch_count integer;
  linked_count integer;
begin
  select count(*)
  into mismatch_count
  from camping_audit_20260823_decisions decision
  left join public.places place on place.id = decision.id
  where place.id is null
     or place.name <> decision.name
     or place.category <> 'camping'
     or place.approved is not true
     or place.deleted_at is not null
     or place.relevance_status <> 'review'
     or place.operational_status <> 'unknown'
     or place.is_curation_protected is true
     or place.last_verified_at is not null;

  if mismatch_count <> 0 then
    raise exception '캠핑 감사 대상의 현재 상태가 검증 스냅샷과 다릅니다: %곳', mismatch_count;
  end if;

  select
    (select count(*) from public.reviews where place_id in (
      select id from camping_audit_20260823_decisions where decision = 'hide'
    ))
    + (select count(*) from public.favorites where place_id in (
      select id from camping_audit_20260823_decisions where decision = 'hide'
    ))
    + (select count(*) from public.place_rides where place_id in (
      select id from camping_audit_20260823_decisions where decision = 'hide'
    ))
    + (select count(*) from public.place_rider_fact_votes where place_id in (
      select id from camping_audit_20260823_decisions where decision = 'hide'
    ))
    + (select count(*) from public.reports where target_type = 'place' and target_id in (
      select id from camping_audit_20260823_decisions where decision = 'hide'
    ))
  into linked_count;

  if linked_count <> 0 then
    raise exception '숨김 대상에 새 사용자 연결 기록이 생겼습니다: %건', linked_count;
  end if;
end
$$;

create temporary table camping_audit_20260823_before
on commit drop
as
select
  place.id,
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
from public.places place
join camping_audit_20260823_decisions decision on decision.id = place.id;

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
select
  decision.id,
  case when decision.decision = 'verify' then 'official_website' else 'manual_review' end,
  case when decision.decision = 'verify' then 'relevance_confirmed' else 'relevance_rejected' end,
  'strong',
  case
    when decision.decision = 'verify' then '공식 캠핑 시설·예약 안내'
    else '공식 시설 안내와 모토맵 운영자 최종 판단'
  end,
  decision.source_url,
  'operator-camping-audit-20260823:' || decision.id::text,
  '2026-08-23T00:27:22Z'::timestamptz,
  jsonb_build_object(
    'criterion', '바이크가 배정 사이트까지 진입해 사이트 안이나 바로 옆에 주차 가능',
    'decision', decision.decision,
    'summary', decision.evidence_summary,
    'user_connection_count', 0,
    'hard_delete', false
  ),
  'operator-review-20260823'
from camping_audit_20260823_decisions decision;

update public.places place
set
  relevance_status = 'verified',
  operational_status = 'operational',
  last_verified_at = '2026-08-23T00:27:22Z'::timestamptz,
  next_verification_at = '2026-11-21T00:27:22Z'::timestamptz
from camping_audit_20260823_decisions decision
where place.id = decision.id
  and decision.decision = 'verify';

update public.places place
set
  deleted_at = '2026-08-23T00:27:22Z'::timestamptz,
  relevance_status = 'excluded',
  operational_status = 'unknown',
  is_curation_protected = false,
  last_verified_at = '2026-08-23T00:27:22Z'::timestamptz,
  next_verification_at = null
from camping_audit_20260823_decisions decision
where place.id = decision.id
  and decision.decision = 'hide';

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
  action.action_type,
  action.reason,
  before.previous_state,
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
from camping_audit_20260823_decisions decision
join public.places place on place.id = decision.id
join camping_audit_20260823_before before on before.id = decision.id
join public.place_curation_evidence evidence
  on evidence.place_id = decision.id
 and evidence.source_reference = 'operator-camping-audit-20260823:' || decision.id::text
cross join lateral (
  values
    (
      case when decision.decision = 'verify' then 'verify_relevance' else 'soft_hide' end,
      case
        when decision.decision = 'verify'
          then '오토캠핑 기준 충족을 공식 근거로 확인함'
        else '사이트 옆 바이크 주차 근거가 부족해 운영자 승인으로 등록 장소에서 제외함'
      end
    )
) action(action_type, reason);

-- 검증 유지 대상은 운영 상태도 별도 축으로 기록한다.
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
  'set_operational_status',
  '현재 공식 캠핑 시설·예약 운영 근거를 확인함',
  before.previous_state,
  jsonb_build_object(
    'operational_status', place.operational_status,
    'last_verified_at', place.last_verified_at,
    'next_verification_at', place.next_verification_at
  ),
  'operator-review-20260823'
from camping_audit_20260823_decisions decision
join public.places place on place.id = decision.id
join camping_audit_20260823_before before on before.id = decision.id
join public.place_curation_evidence evidence
  on evidence.place_id = decision.id
 and evidence.source_reference = 'operator-camping-audit-20260823:' || decision.id::text
where decision.decision = 'verify';

do $$
declare
  verified_count integer;
  hidden_count integer;
  evidence_count integer;
  action_count integer;
begin
  select count(*) into verified_count
  from public.places
  where id in (select id from camping_audit_20260823_decisions where decision = 'verify')
    and approved is true
    and deleted_at is null
    and relevance_status = 'verified'
    and operational_status = 'operational';

  select count(*) into hidden_count
  from public.places
  where id in (select id from camping_audit_20260823_decisions where decision = 'hide')
    and approved is true
    and deleted_at = '2026-08-23T00:27:22Z'::timestamptz
    and relevance_status = 'excluded'
    and operational_status = 'unknown';

  select count(*) into evidence_count
  from public.place_curation_evidence
  where source_reference like 'operator-camping-audit-20260823:%';

  select count(*) into action_count
  from public.place_curation_actions action
  join public.place_curation_evidence evidence on evidence.id = action.evidence_id
  where evidence.source_reference like 'operator-camping-audit-20260823:%';

  if verified_count <> 5 or hidden_count <> 2 or evidence_count <> 7 or action_count <> 12 then
    raise exception '캠핑 감사 사후 검증 실패: verified %, hidden %, evidence %, actions %',
      verified_count, hidden_count, evidence_count, action_count;
  end if;
end
$$;

commit;
