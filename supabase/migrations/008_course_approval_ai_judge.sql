-- ① 코스 제보에 승인 플로우 도입 (기존엔 제출 즉시 공개되는 모더레이션 구멍)
-- ② 제보(장소·코스) INSERT 시 AI 판정 Edge Function 호출 (pg_net)
-- 사전 조건: 005(pg_net·디스코드), 006(push_tokens), 007(places soft delete).
-- Vault 필요 키: judge_function_url, judge_webhook_secret (SQL Editor에서 1회 등록)

-- ── ① 코스 승인 + soft delete ───────────────────────────────
alter table public.courses add column if not exists approved boolean not null default false;
alter table public.courses add column if not exists deleted_at timestamptz;

-- 기존 시드 코스(created_by 없음)는 승인 상태로 백필
update public.courses set approved = true where created_by is null;

-- 디스코드 알림 함수에 courses 분기 추가 (005 함수 대체)
create or replace function public.notify_discord_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  msg text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'discord_webhook_url';

  if webhook_url is null then
    return new;
  end if;

  if tg_table_name = 'places' then
    msg := '📍 새 장소 제보: ' || new.name || ' (' || new.category || ')'
        || E'\n주소: ' || coalesce(new.address, '-')
        || E'\n설명: ' || coalesce(nullif(new.description, ''), '-');
  elsif tg_table_name = 'courses' then
    msg := '🛣️ 새 코스 제보: ' || new.name
        || E'\n거리: ' || coalesce(new.distance::text, '-') || 'km · 예상 ' || coalesce(new.duration::text, '-') || '분'
        || E'\n설명: ' || coalesce(nullif(new.description, ''), '-');
  else
    msg := '💬 새 건의 (' || new.type || ')'
        || E'\n' || left(new.content, 800);
  end if;

  perform net.http_post(
    url := webhook_url,
    body := jsonb_build_object('content', msg),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists courses_notify_discord on public.courses;
create trigger courses_notify_discord
  after insert on public.courses
  for each row
  when (new.approved = false)
  execute function public.notify_discord_submission();

-- 코스 승인 시 제보자 푸시 (006 places 패턴과 동일, created_by 기준)
create or replace function public.notify_course_submitter_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '제보하신 코스가 반영되었습니다 🎉',
    'body', new.name || ' — 이제 모토맵에서 볼 수 있어요.',
    'sound', 'default'
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

drop trigger if exists courses_approval_push on public.courses;
create trigger courses_approval_push
  after update of approved on public.courses
  for each row
  when (old.approved = false and new.approved = true)
  execute function public.notify_course_submitter_on_approval();

-- ── ② AI 판정 Edge Function 호출 ────────────────────────────
-- 제보 INSERT 시 judge-submission Edge Function 에 행을 넘긴다. 판정 결과는
-- EF 가 디스코드로 발송(기본 알림과 별개의 두 번째 메시지 — EF 장애가
-- 기본 알림 파이프라인에 영향을 주지 않도록 트리거를 분리).
create or replace function public.notify_ai_judge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
  from vault.decrypted_secrets where name = 'judge_function_url';
  select decrypted_secret into fn_secret
  from vault.decrypted_secrets where name = 'judge_webhook_secret';

  if fn_url is null or fn_secret is null then
    return new; -- 미설정 시 조용히 통과
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-judge-secret', fn_secret
    )
  );
  return new;
end;
$$;

drop trigger if exists places_ai_judge on public.places;
create trigger places_ai_judge
  after insert on public.places
  for each row
  when (new.approved = false)
  execute function public.notify_ai_judge();

drop trigger if exists courses_ai_judge on public.courses;
create trigger courses_ai_judge
  after insert on public.courses
  for each row
  when (new.approved = false)
  execute function public.notify_ai_judge();
