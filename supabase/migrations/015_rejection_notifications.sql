-- 반려 알림 + 사유 전달
--
-- 반려 절차(007): 미승인 제보에 deleted_at = now() (approved 는 false 유지).
-- 지금까지는 반려되면 아무 안내가 없었다 — 사유 컬럼을 추가하고, 반려 시점에
-- 인앱 알림 + 푸시로 사유를 함께 전달한다.
--
-- 관리자 반려 방법 (SQL Editor):
--   update public.places
--   set deleted_at = now(), rejected_reason = '이미 등록된 장소예요.'
--   where id = '...';
--   (courses 동일. rejected_reason 은 body 에 문장 그대로 이어붙으므로 완결 문장으로.)
--
-- 트리거 조건에 approved = false 를 두어, 승인 후 운영 정리로 soft delete 되는
-- 행(approved = true)에는 반려 알림이 가지 않는다. 시드 데이터는 submitted_by /
-- created_by 가 null 이라 함수 초입에서 걸러진다.

alter table public.places add column if not exists rejected_reason text;
alter table public.courses add column if not exists rejected_reason text;

-- ── 장소 반려 알림 ──────────────────────────────────────────

create or replace function public.notify_submitter_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  body_text text;
begin
  if new.submitted_by is null then
    return new;
  end if;

  body_text := public.with_object_josa(new.name)
    || ' 검토했지만 이번에는 담지 못했어요.'
    || coalesce(' ' || nullif(trim(new.rejected_reason), ''), '');

  -- 푸시 토큰이 없는 사용자도 인앱 알림은 받도록 insert 를 먼저 한다 (014 와 동일)
  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.submitted_by,
    'place_rejected',
    '제보하신 장소가 반영되지 못했어요',
    body_text,
    null  -- 반려된 장소는 앱에서 조회할 수 없어 이동 대상이 없다
  );

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '제보하신 장소가 반영되지 못했어요',
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object('type', 'place_rejected')
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.submitted_by;

  if messages is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists places_rejection_push on public.places;
create trigger places_rejection_push
  after update of deleted_at on public.places
  for each row
  when (old.deleted_at is null and new.deleted_at is not null and new.approved = false)
  execute function public.notify_submitter_on_rejection();

-- ── 코스 반려 알림 ──────────────────────────────────────────

create or replace function public.notify_course_submitter_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  body_text text;
begin
  if new.created_by is null then
    return new;
  end if;

  body_text := public.with_object_josa(new.name)
    || ' 검토했지만 이번에는 담지 못했어요.'
    || coalesce(' ' || nullif(trim(new.rejected_reason), ''), '');

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.created_by,
    'course_rejected',
    '제보하신 코스가 반영되지 못했어요',
    body_text,
    null
  );

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '제보하신 코스가 반영되지 못했어요',
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object('type', 'course_rejected')
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.created_by;

  if messages is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists courses_rejection_push on public.courses;
create trigger courses_rejection_push
  after update of deleted_at on public.courses
  for each row
  when (old.deleted_at is null and new.deleted_at is not null and new.approved = false)
  execute function public.notify_course_submitter_on_rejection();
