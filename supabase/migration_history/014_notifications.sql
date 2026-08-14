-- 인앱 알림 목록 — 승인 푸시를 보낼 때 이력을 함께 기록한다.
-- RLS 로 본인 행만 조회·읽음 처리 가능 (insert 는 definer 트리거만 수행).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "own notifications select" on public.notifications
  for select using (auth.uid() = user_id);

create policy "own notifications update" on public.notifications
  for update using (auth.uid() = user_id);

-- 009 함수 재정의: 푸시 발송 전에 알림 이력을 남긴다.
-- 푸시 토큰이 없는 사용자도 인앱 알림은 받도록 insert 를 토큰 조회보다 앞에 둔다.

create or replace function public.notify_submitter_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
begin
  if new.submitted_by is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.submitted_by,
      'place_approved',
      '제보하신 장소가 반영되었습니다 🎉',
      public.with_object_josa(new.name) || ' 이제 모토맵에서 볼 수 있어요!',
      jsonb_build_object('placeId', new.id)
    );
  end if;

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
  if new.created_by is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.created_by,
      'course_approved',
      '제보하신 코스가 반영되었습니다 🎉',
      public.with_object_josa(new.name) || ' 이제 모토맵에서 볼 수 있어요!',
      jsonb_build_object('courseId', new.id)
    );
  end if;

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
