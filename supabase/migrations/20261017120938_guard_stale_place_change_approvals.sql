begin;

-- 이전 승인 계약/검증을 보존하고 바깥에서 근거 유효기간과 이전 후속 책임을 추가한다.
-- 7일이 지난 감지/제보는 반려 후 실제 재조회·새 고정 계획이 필요하다.
alter function public.resolve_place_change_review(uuid,text,text) set schema place_catalog_private;
alter function public.resolve_place_change_report(uuid,text,text) set schema place_catalog_private;
revoke all on function place_catalog_private.resolve_place_change_review(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function place_catalog_private.resolve_place_change_report(uuid,text,text) from public,anon,authenticated,service_role;

create table place_catalog_private.move_followups (
  id uuid primary key default gen_random_uuid(),
  source_review_id uuid unique references public.place_change_reviews(id) on delete restrict,
  -- 사용자 탈퇴 시 원본 제보의 CASCADE 삭제를 막지 않는다. 사용자 ID는 복사하지 않는다.
  source_report_id uuid unique,
  place_id uuid not null references public.places(id) on delete restrict,
  owner text not null check (char_length(btrim(owner)) between 1 and 100),
  due_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  target_place_id uuid references public.places(id) on delete restrict,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(source_review_id, source_report_id)=1),
  check ((status='pending' and resolved_at is null) or
    (status<>'pending' and resolved_at is not null and nullif(btrim(resolution_note),'') is not null))
);
alter table place_catalog_private.move_followups enable row level security;
create index move_followups_pending_due on place_catalog_private.move_followups(due_at) where status='pending';
-- 운영 SQL로만 관리한다. 클라이언트·Discord에서 직접 수정할 수 없다.
revoke all on table place_catalog_private.move_followups from public,anon,authenticated,service_role;

create function public.resolve_place_change_review(p_review_id uuid,p_decision text,p_acted_by text)
returns table(place_id uuid,place_name text,decision text,applied_changes jsonb)
language plpgsql security definer set search_path = '' as $$
declare candidate public.place_change_reviews%rowtype; result record;
begin
  select * into candidate from public.place_change_reviews where id=p_review_id for update;
  if p_decision='apply' and candidate.status='pending'
      and candidate.detected_at < now()-interval '7 days' then
    raise exception '근거가 오래되어 재검증이 필요합니다. 기존 건을 반려한 뒤 새 검토안을 생성하세요.';
  end if;
  select * into result from place_catalog_private.resolve_place_change_review(p_review_id,p_decision,p_acted_by);
  if p_decision='apply' and exists(select 1 from public.places p where p.id=result.place_id
      and p.operational_status='moved' and p.deleted_at is not null) then
    insert into place_catalog_private.move_followups(source_review_id,place_id,owner)
    values(p_review_id,result.place_id,btrim(p_acted_by));
  end if;
  return query select result.place_id,result.place_name,result.decision,result.applied_changes;
end;
$$;
create function public.resolve_place_change_report(p_report_id uuid,p_decision text,p_acted_by text)
returns table(place_id uuid,place_name text,decision text,applied_changes jsonb)
language plpgsql security definer set search_path = '' as $$
declare candidate public.place_change_reports%rowtype; result record;
begin
  select * into candidate from public.place_change_reports where id=p_report_id for update;
  if p_decision<>'dismiss' and candidate.status='pending'
      and candidate.created_at < now()-interval '7 days' then
    raise exception '제보가 오래되어 재확인이 필요합니다. 기존 건을 반려한 뒤 새 제보·검토안을 생성하세요.';
  end if;
  select * into result from place_catalog_private.resolve_place_change_report(p_report_id,p_decision,p_acted_by);
  if p_decision='hide_moved' then
    insert into place_catalog_private.move_followups(source_report_id,place_id,owner)
    values(p_report_id,result.place_id,btrim(p_acted_by));
  end if;
  return query select result.place_id,result.place_name,result.decision,result.applied_changes;
end;
$$;
revoke all on function public.resolve_place_change_review(uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_place_change_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_place_change_review(uuid,text,text) to service_role;
grant execute on function public.resolve_place_change_report(uuid,text,text) to service_role;

commit;
