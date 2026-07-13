-- 새 장소 제보(places, approved=false)·건의(feedback) INSERT 시 디스코드 웹훅으로 알림.
-- 웹훅 URL은 공개 repo에 노출되지 않도록 Vault에 저장한다. 실행 전 1회:
--   select vault.create_secret('<디스코드 웹훅 URL>', 'discord_webhook_url');
-- URL 미설정 시 트리거는 조용히 통과한다(제보 INSERT를 막지 않음).

create extension if not exists pg_net;

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

-- 시드/관리자 등록(approved=true)은 제외하고 사용자 제보만 알림
drop trigger if exists places_notify_discord on public.places;
create trigger places_notify_discord
  after insert on public.places
  for each row
  when (new.approved = false)
  execute function public.notify_discord_submission();

drop trigger if exists feedback_notify_discord on public.feedback;
create trigger feedback_notify_discord
  after insert on public.feedback
  for each row
  execute function public.notify_discord_submission();
