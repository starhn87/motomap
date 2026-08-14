-- 반려 푸시 딥링크 (017 함수 재정의)
--
-- 반려 푸시의 data 에 방금 기록한 인앱 알림 id(notificationId)를 실어,
-- 푸시를 탭하면 앱이 알림 목록에서 그 알림으로 스크롤·강조하게 한다.
-- (반려된 제보는 앱에서 조회할 수 없어 장소·코스로는 이동할 수 없다)

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
  notif_id uuid;
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
  values (new.submitted_by, 'place_rejected', title_text, body_text, null)
  returning id into notif_id;

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', title_text,
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object('type', 'place_rejected', 'notificationId', notif_id)
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
  notif_id uuid;
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
  values (new.created_by, 'course_rejected', title_text, body_text, null)
  returning id into notif_id;

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', title_text,
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object('type', 'course_rejected', 'notificationId', notif_id)
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
