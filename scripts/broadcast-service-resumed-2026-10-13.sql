-- 운영자 승인 후 연결 검증이 끝난 경우에만 한 번 실행한다. 테스트는 마지막 COMMIT을 ROLLBACK으로 바꾼다.
-- 새 테이블·RPC·권한은 만들지 않는다. 기존 공지 생성과 비동기 전송을 짧은 트랜잭션에 묶는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('motomap-service-resumed-2026-10-13-1.2.8', 0));

DO $$
DECLARE
  inserted integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE data->>'campaignId' = 'motomap-service-resumed-2026-10-13-1.2.8'
  ) THEN
    RAISE EXCEPTION '재개 캠페인이 이미 실행됐습니다. 다시 발송하지 않습니다.';
  END IF;

  SELECT public.broadcast_notice(
    '모토맵이 돌아왔어요 🏍️',
    '기다려 주셔서 감사합니다. App Store에서 최신 버전으로 업데이트하고 다시 라이딩을 시작해 보세요.',
    jsonb_build_object(
      'campaignId', 'motomap-service-resumed-2026-10-13-1.2.8',
      'kind', 'service_resumed',
      'action', 'update_app',
      'storeUrl', 'https://apps.apple.com/kr/app/id6773636183'
    )
  ) INTO inserted;
  IF inserted = 0 THEN
    RAISE EXCEPTION '공지 대상이 없습니다. 전송을 취소합니다.';
  END IF;
END;
$$;

-- pg_net은 COMMIT 후에만 전송한다. queue에서 ID를 보존한 뒤에는 재전송 없이 응답을 조회한다.
UPDATE public.notifications
SET data = data || jsonb_build_object('pushRequestIds', COALESCE((
  SELECT jsonb_agg(q.id ORDER BY q.id)
  FROM net.http_request_queue q
  WHERE q.url = 'https://exp.host/--/api/v2/push/send'
    AND convert_from(q.body, 'UTF8')::jsonb @>
      '[{"data":{"campaignId":"motomap-service-resumed-2026-10-13-1.2.8"}}]'::jsonb
), '[]'::jsonb))
WHERE data->>'campaignId' = 'motomap-service-resumed-2026-10-13-1.2.8';

DO $$
DECLARE
  requests jsonb;
  expected integer;
BEGIN
  SELECT data->'pushRequestIds' INTO requests
  FROM public.notifications
  WHERE data->>'campaignId' = 'motomap-service-resumed-2026-10-13-1.2.8'
  LIMIT 1;
  SELECT ceil(count(*) / 100.0)::integer INTO expected FROM public.push_tokens;
  IF jsonb_array_length(requests) <> expected THEN
    RAISE EXCEPTION '전송 요청 ID 추적에 실패했습니다. 공지와 전송을 취소합니다.';
  END IF;
  UPDATE net.http_request_queue SET timeout_milliseconds = 10000
  WHERE id IN (SELECT value::bigint FROM jsonb_array_elements_text(requests));
END;
$$;

COMMIT;

SELECT count(*) AS notice_count,
  max(data->>'pushRequestIds') AS push_request_ids
FROM public.notifications
WHERE data->>'campaignId' = 'motomap-service-resumed-2026-10-13-1.2.8';
