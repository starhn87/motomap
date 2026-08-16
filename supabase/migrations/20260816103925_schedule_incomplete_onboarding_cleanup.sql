-- 소셜 인증만 마치고 프로필을 만들지 않은 계정을 매일 정리한다.
-- 호출 URL과 비밀값은 환경마다 다르므로 저장소에 넣지 않고 Vault에서 읽는다.
-- 필요한 Vault 키: onboarding_cleanup_function_url, onboarding_cleanup_secret

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'cleanup-incomplete-onboarding-accounts',
  '20 18 * * *', -- 매일 03:20 KST (pg_cron은 UTC)
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'onboarding_cleanup_function_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'onboarding_cleanup_secret'
        )
      ),
      body := jsonb_build_object('dryRun', false),
      timeout_milliseconds := 60000
    )
    where exists (
      select 1 from vault.decrypted_secrets
      where name = 'onboarding_cleanup_function_url'
    )
      and exists (
        select 1 from vault.decrypted_secrets
        where name = 'onboarding_cleanup_secret'
      )
  $$
);
