-- 제보 승인 시 제보자에게 Expo 푸시 알림.
-- 1) push_tokens: 클라이언트(lib/push.ts)가 Expo 푸시 토큰을 upsert.
-- 2) places.approved false→true UPDATE 시 제보자의 모든 기기로 발송(pg_net → Expo Push API).
-- 사전 조건: 005에서 pg_net 활성화됨.

create table if not exists public.push_tokens (
  token text primary key, -- Expo 푸시 토큰. 기기 주인이 계정을 바꾸면 upsert로 새 계정에 귀속
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.notify_submitter_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
begin
  -- 제보자의 모든 기기 토큰으로 메시지 배열 구성 (Expo Push API는 배열 허용)
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '제보하신 장소가 반영되었습니다 🎉',
    'body', new.name || ' — 이제 모토맵 지도에서 볼 수 있어요.',
    'sound', 'default'
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.submitted_by;

  if messages is null then
    return new; -- 토큰 없음(권한 거부·미등록) — 조용히 통과
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists places_approval_push on public.places;
create trigger places_approval_push
  after update of approved on public.places
  for each row
  when (old.approved = false and new.approved = true)
  execute function public.notify_submitter_on_approval();
