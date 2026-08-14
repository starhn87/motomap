-- 019 의 재시도 함수 권한 잠금.
--
-- public 스키마의 일반 함수는 PostgREST RPC(/rest/v1/rpc/...)로 노출되고 기본
-- privileges 로 anon 도 실행할 수 있다. retry_missing_judgements 는 AI 판정(웹 검색
-- 포함 Opus 호출)을 발사하므로 익명 연타 = API 비용 공격이 된다. pg_cron 은
-- postgres 권한으로 실행돼 revoke 의 영향을 받지 않는다.

revoke execute on function public.retry_missing_judgements()
  from public, anon, authenticated;
