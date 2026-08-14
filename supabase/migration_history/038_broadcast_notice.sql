-- 공지 발송 — 운영자가 전체 가입자에게 보내는 알림.
-- OTA 로 기능이 계속 늘어나는데 스토어 릴리스 노트는 OTA 에 안 붙는다는 게 동기.
-- 알림 행은 전원에게(기존 알림 목록·뱃지·읽음 UI 가 그대로 처리), 푸시는
-- 토큰 등록자에게만 나간다. 발송은 SQL Editor 에서:
--   select public.broadcast_notice('제목', '내용');
-- 셋째 인자로 '{"url":"/directions"}'::jsonb 처럼 앱 내 딥링크를 실으면
-- 알림 탭 시 그 화면으로 이동한다(생략 가능).


create or replace function public.broadcast_notice(
  p_title text,
  p_body text,
  p_data jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
  batch jsonb;
begin
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, 'notice', p_title, p_body, p_data
  from public.profiles p;
  get diagnostics inserted = row_count;

  -- Expo Push API 는 요청당 100건 제한 — 토큰을 100개씩 끊어 보낸다
  for batch in
    select jsonb_agg(msg)
    from (
      select jsonb_build_object(
               'to', t.token,
               'title', p_title,
               'body', p_body,
               'sound', 'default',
               'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('type', 'notice')
             ) as msg,
             row_number() over () as rn
      from public.push_tokens t
    ) numbered
    group by (rn - 1) / 100
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;

  return inserted;
end;
$$;

-- 발송은 운영자(SQL Editor = postgres/service_role)만 — 클라이언트 키로는 못 부른다
revoke execute on function public.broadcast_notice(text, text, jsonb) from public, anon, authenticated;
