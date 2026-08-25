create table public.place_change_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete restrict,
  reason text not null,
  description text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  discord_reported_at timestamptz,
  discord_error text,
  constraint place_change_reports_reason_check check (
    reason in (
      'permanently_closed',
      'temporarily_closed',
      'moved',
      'business_info_changed',
      'other'
    )
  ),
  constraint place_change_reports_description_check check (
    description is null
    or char_length(btrim(description)) between 1 and 500
  ),
  constraint place_change_reports_status_check check (
    status in ('pending', 'resolved', 'dismissed')
  ),
  constraint place_change_reports_resolution_check check (
    (status = 'pending' and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  ),
  constraint place_change_reports_resolution_note_check check (
    resolution_note is null
    or char_length(btrim(resolution_note)) between 1 and 2000
  ),
  constraint place_change_reports_discord_error_check check (
    discord_error is null or char_length(discord_error) between 1 and 1000
  )
);

comment on table public.place_change_reports is
  '사용자가 등록 장소의 폐업·휴업·이전·정보 변경을 알리는 검토 대기열. 장소는 자동 변경하지 않는다.';

create unique index place_change_reports_one_pending_per_user_place_idx
  on public.place_change_reports(reporter_id, place_id)
  where status = 'pending';

create index place_change_reports_pending_idx
  on public.place_change_reports(created_at, place_id)
  where status = 'pending';

alter table public.place_change_reports enable row level security;

-- 앱은 인증을 자체 검증하는 Edge Function으로만 제출한다. 테이블을 클라이언트에
-- 직접 노출하지 않아 reporter_id와 내부 검토 상태를 다른 사용자가 읽지 못하게 한다.
revoke all on table public.place_change_reports
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.place_change_reports to service_role;

-- 계정 정리 시 운영 제보에 남은 사용자 식별자도 함께 제거한다.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  update public.reviews
  set user_id = null, user_name = '탈퇴한 사용자', photos = '{}'::text[]
  where user_id = p_user_id;

  update public.course_reviews
  set user_id = null, user_name = '탈퇴한 사용자'
  where user_id = p_user_id;

  update public.places set submitted_by = null where submitted_by = p_user_id;
  update public.courses set created_by = null where created_by = p_user_id;
  update public.road_hazards
  set reported_by = null, photo = null
  where reported_by = p_user_id;

  with deleted_votes as (
    delete from public.hazard_votes
    where user_id = p_user_id
    returning hazard_id
  )
  update public.road_hazards h
  set
    confirm_count = (
      select count(*)::integer
      from public.hazard_votes v
      where v.hazard_id = h.id and v.kind = 'confirm'
    ),
    resolved_count = (
      select count(*)::integer
      from public.hazard_votes v
      where v.hazard_id = h.id
        and v.kind = 'resolve'
        and v.created_at >= h.last_confirmed_at
    ),
    last_resolved_at = (
      select max(v.created_at)
      from public.hazard_votes v
      where v.hazard_id = h.id
        and v.kind = 'resolve'
        and v.created_at >= h.last_confirmed_at
    )
  where h.id in (select hazard_id from deleted_votes);

  delete from public.blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  delete from public.favorites where user_id = p_user_id;
  delete from public.feedback where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.place_change_reports where reporter_id = p_user_id;
  delete from public.place_rides where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.reports
  where reporter_id = p_user_id
     or (target_type = 'user' and target_id = p_user_id);
  delete from public.review_likes where user_id = p_user_id;
  delete from public.rides where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
