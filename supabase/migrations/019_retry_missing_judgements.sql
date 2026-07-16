-- 판정 누락 자동 재시도 (pg_cron)
--
-- smart-task 는 요청을 즉시 200 으로 받고 판정을 EdgeRuntime.waitUntil 백그라운드로
-- 돌리는데, EF 인스턴스가 도중에 내려가면 판정이 실패 메시지도 없이 증발한다
-- (실측: 2026-07-16 케이테스트 건 — pg_net 200 접수 후 판정 무소식).
-- 판정 완료 = ai_reject_reason 저장이므로(verdict 무관 항상 저장), pending 인데
-- 3분 넘게 문구가 없는 제보를 5분마다 재판정에 보낸다. 윈도는 1시간 —
-- 그 안에 성공하면 문구가 채워져 자동으로 멈춘다.
--
-- 참고: 재발사 직후 원 판정이 뒤늦게 완료되면 디스코드에 판정 메시지가 중복될 수
-- 있다(낮은 확률, 무해). 016 이전에 판정된 옛 제보는 1시간 윈도 밖이라 안 건드린다.

create extension if not exists pg_cron;

create or replace function public.retry_missing_judgements()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
  r record;
begin
  select decrypted_secret into fn_url
  from vault.decrypted_secrets where name = 'judge_function_url';
  select decrypted_secret into fn_secret
  from vault.decrypted_secrets where name = 'judge_webhook_secret';

  if fn_url is null or fn_secret is null then
    return;
  end if;

  for r in
    select 'places' as t, to_jsonb(p) as rec
    from public.places p
    where p.approved = false and p.deleted_at is null and p.ai_reject_reason is null
      and p.created_at < now() - interval '3 minutes'
      and p.created_at > now() - interval '1 hour'
    union all
    select 'courses', to_jsonb(c)
    from public.courses c
    where c.approved = false and c.deleted_at is null and c.ai_reject_reason is null
      and c.created_at < now() - interval '3 minutes'
      and c.created_at > now() - interval '1 hour'
  loop
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object('table', r.t, 'record', r.rec),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-judge-secret', fn_secret
      )
    );
  end loop;
end;
$$;

-- 같은 이름으로 재실행하면 스케줄이 갱신된다
select cron.schedule(
  'retry-missing-judgements',
  '*/5 * * * *',
  'select public.retry_missing_judgements()'
);
