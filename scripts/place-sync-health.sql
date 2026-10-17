-- 운영자 읽기 전용 점검. migration 적용 후 실행한다. 비밀값·사용자 정보는 출력하지 않는다.
select jobname, schedule, active
from cron.job where jobname = 'scan-place-changes-for-review';

select name, true as exists
from vault.secrets where name in ('place_change_monitor_function_url','place_change_monitor_secret');

select
  count(*) filter (where p.approved and p.deleted_at is null) as active_places,
  count(*) filter (where p.approved and p.deleted_at is null
    and (nullif(p.source_provider,'') is null or nullif(p.source_place_id,'') is null)) as missing_source_identity,
  count(*) filter (where p.approved and p.deleted_at is null and p.next_verification_at < now()) as verification_overdue,
  count(*) filter (where p.approved and p.deleted_at is null and s.place_id is null) as never_monitored,
  max(s.last_checked_at) as last_actual_check,
  count(*) filter (where s.next_check_at < now()) as monitor_due,
  count(*) filter (where s.last_result='error') as monitor_errors
from public.places p left join public.place_change_monitor_state s on s.place_id=p.id;

select count(*) as pending_reviews, min(detected_at) as oldest_pending,
  count(*) filter (where detected_at < now()-interval '7 days') as stale_pending,
  count(*) filter (where reported_at is null) as not_reported
from public.place_change_reviews where status='pending';

select count(*) as pending_reports, min(created_at) as oldest_pending,
  count(*) filter (where created_at < now()-interval '7 days') as stale_pending,
  count(*) filter (where discord_error is not null) as discord_errors
from public.place_change_reports where status='pending';

select count(*) as pending_move_followups, min(due_at) as next_due,
  count(*) filter (where due_at < now()) as overdue
from place_catalog_private.move_followups where status='pending';

select public.get_place_catalog_revision() as catalog_revision,
  jsonb_array_length(public.get_place_catalog_suppressions()) as suppressed_source_count;
