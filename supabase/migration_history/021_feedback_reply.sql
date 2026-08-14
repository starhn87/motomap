-- 건의 답변 파이프라인 (디스코드 봇)
--
-- 흐름: 새 건의 → 디스코드에 봇 메시지 + [답변하기] 버튼 → 클릭하면 인풋 모달
-- (discord-interactions EF) → 제출 시 feedback.reply 저장 → 이 트리거가 건의자에게
-- 인앱 알림 + 푸시 (본문 = 답변 전문). SQL 로 reply 를 직접 업데이트해도 같은 경로다.
--
-- 사전 준비 (Vault): 건의 메시지를 버튼과 함께 보내려면 봇 자격이 필요하다.
--   select vault.create_secret('<봇 토큰>', 'discord_bot_token');
--   select vault.create_secret('<채널 ID>', 'discord_channel_id');
-- 미설정이면 기존 웹훅(버튼 없음)으로 폴백한다.

alter table public.feedback add column if not exists reply text;
alter table public.feedback add column if not exists reply_at timestamptz;

-- ── 답변 → 건의자 알림·푸시 ─────────────────────────────────

create or replace function public.notify_feedback_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  body_text text;
  notif_id uuid;
begin
  if new.user_id is null then
    return new;
  end if;

  body_text := new.reply;

  insert into public.notifications (user_id, type, title, body, data)
  values (new.user_id, 'feedback_reply', '보내주신 의견에 답변이 도착했어요', body_text, null)
  returning id into notif_id;

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '보내주신 의견에 답변이 도착했어요',
    'body', body_text,
    'sound', 'default',
    'data', jsonb_build_object('type', 'feedback_reply', 'notificationId', notif_id)
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.user_id;

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

drop trigger if exists feedback_reply_push on public.feedback;
create trigger feedback_reply_push
  after update of reply on public.feedback
  for each row
  when (new.reply is not null and new.reply is distinct from old.reply)
  execute function public.notify_feedback_reply();

-- ── 새 건의 → 봇 메시지 + [답변하기] 버튼 ──────────────────
-- 005 의 notify_discord_submission 재정의. 건의(feedback)는 봇 자격이 있으면
-- 채널 메시지 API 로 버튼과 함께 보내고, 없으면 기존 웹훅으로. 장소 제보 분기는
-- 그대로 웹훅이다 (버튼이 필요 없고, AI 판정 메시지가 봇 버튼을 단다).

create or replace function public.notify_discord_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  bot_token text;
  channel_id text;
  msg text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets where name = 'discord_webhook_url';

  if tg_table_name = 'places' then
    msg := '📍 새 장소 제보: ' || new.name || ' (' || new.category || ')'
        || E'\n주소: ' || coalesce(new.address, '-')
        || E'\n설명: ' || coalesce(nullif(new.description, ''), '-');

    if webhook_url is not null then
      perform net.http_post(
        url := webhook_url,
        body := jsonb_build_object('content', msg),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
    return new;
  end if;

  -- feedback
  msg := '💬 새 건의 (' || new.type || ')'
      || E'\n' || left(new.content, 800);

  select decrypted_secret into bot_token
  from vault.decrypted_secrets where name = 'discord_bot_token';
  select decrypted_secret into channel_id
  from vault.decrypted_secrets where name = 'discord_channel_id';

  if bot_token is not null and channel_id is not null then
    perform net.http_post(
      url := 'https://discord.com/api/v10/channels/' || channel_id || '/messages',
      body := jsonb_build_object(
        'content', msg,
        'components', jsonb_build_array(jsonb_build_object(
          'type', 1,
          'components', jsonb_build_array(jsonb_build_object(
            'type', 2,
            'style', 1,
            'label', '답변하기',
            'custom_id', 'reply:feedback:' || new.id
          ))
        ))
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bot ' || bot_token
      )
    );
  elsif webhook_url is not null then
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object('content', msg),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;
