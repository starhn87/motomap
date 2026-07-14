-- 승인 푸시 개선:
--   ① 문구에서 em dash 제거, 자연스러운 한국어("카페펑키를 이제 모토맵에서 볼 수 있어요!")
--   ② data 페이로드(type + placeId/courseId) 추가 — 앱이 알림 탭 시 해당 화면으로 이동
-- 006(places)·008(courses) 함수를 대체한다.

-- 받침 유무에 따라 목적격 조사(을/를)를 붙인다. 한글 음절이 아니면 '를'.
create or replace function public.with_object_josa(word text)
returns text
language sql
immutable
as $$
  select word || case
    when ascii(right(word, 1)) between 44032 and 55203
         and (ascii(right(word, 1)) - 44032) % 28 > 0
    then '을'
    else '를'
  end
$$;

create or replace function public.notify_submitter_on_approval()
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
    'title', '제보하신 장소가 반영되었습니다 🎉',
    'body', public.with_object_josa(new.name) || ' 이제 모토맵에서 볼 수 있어요!',
    'sound', 'default',
    'data', jsonb_build_object('type', 'place_approved', 'placeId', new.id)
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
    'body', public.with_object_josa(new.name) || ' 이제 모토맵에서 볼 수 있어요!',
    'sound', 'default',
    'data', jsonb_build_object('type', 'course_approved', 'courseId', new.id)
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
