-- 반려 알림 문구 재구성 (015 함수 재정의)
--
-- 015 는 body 를 "○○를 검토했지만 이번에는 담지 못했어요. {사유}" 로 조립했는데,
-- AI 가 만드는 사유도 완결 문장이라 상투 접두와 겹쳐 어색했다 (예: "담지 못했어요" 2번).
-- 제보명은 title 로 옮기고 body 는 사유 전문만 싣는다. 사유가 없으면 기본 한 줄.
--   title: ○○ 제보가 반영되지 못했어요
--   body:  {rejected_reason 전문} | (없으면) 검토 결과 이번에는 반영하지 못했어요.

create or replace function public.notify_submitter_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  title_text text;
  body_text text;
begin
  if new.submitted_by is null then
    return new;
  end if;

  title_text := new.name || ' 제보가 반영되지 못했어요';
  body_text := coalesce(
    nullif(trim(new.rejected_reason), ''),
    '검토 결과 이번에는 반영하지 못했어요.'
  );

  insert into public.notifications (user_id, type, title, body, data)
  values (new.submitted_by, 'place_rejected', title_text, body_text, null);

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', title_text,
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

create or replace function public.notify_course_submitter_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  title_text text;
  body_text text;
begin
  if new.created_by is null then
    return new;
  end if;

  title_text := new.name || ' 제보가 반영되지 못했어요';
  body_text := coalesce(
    nullif(trim(new.rejected_reason), ''),
    '검토 결과 이번에는 반영하지 못했어요.'
  );

  insert into public.notifications (user_id, type, title, body, data)
  values (new.created_by, 'course_rejected', title_text, body_text, null);

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', title_text,
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
