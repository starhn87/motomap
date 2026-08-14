-- 구글 Places 응답 캐시.
--
-- 구글 약관은 place_id 만 무기한 보관을 허용하고 나머지 콘텐츠는 30일까지다.
-- 그래서 두 가지를 분리해서 담는다:
--   google_place_links   우리 장소 ↔ google place_id 매핑. 영구 — 이게 쌓일수록
--                        검색(Text Search) 호출이 사라지고 상세만 남는다.
--   google_place_hours   영업시간 본문. fetched_at 기준 30일이 지나면 못 쓰고,
--                        지운다. TTL 을 어기지 않는 게 이 테이블의 존재 이유다.
--
-- 비용이 "조회 횟수"가 아니라 "월간 고유 장소 수"가 되는 게 이 구조의 핵심이다.

-- 우리 쪽 키는 출처마다 다르다: 등록 장소는 uuid, 주유소는 오피넷 UNI_ID,
-- 일반 POI 는 좌표+이름. 하나의 텍스트 키로 합쳐 둔다.
CREATE TABLE IF NOT EXISTS google_place_links (
  source_key text PRIMARY KEY,
  google_place_id text NOT NULL,
  -- 매칭이 맞았는지 나중에 되짚어볼 근거
  matched_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_place_hours (
  google_place_id text PRIMARY KEY,
  -- lib/hours.ts 의 Hours 모양으로 정규화해서 담는다
  hours jsonb,
  business_status text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_place_hours_fetched_at_idx
  ON google_place_hours (fetched_at);

COMMENT ON TABLE google_place_hours IS
  '구글 영업시간 캐시. 약관상 30일 초과 보관 불가 — purge_google_place_hours() 로 지운다.';

-- 만료분 삭제. Edge Function 이 조회 때마다 부르기엔 무거우니 하루 한 번 도는 걸
-- 전제로 한다(대시보드 cron). 안 돌아도 조회 쪽에서 30일 지난 행은 무시한다.
CREATE OR REPLACE FUNCTION purge_google_place_hours()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM google_place_hours WHERE fetched_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- 캐시는 Edge Function(service role)만 만진다. 앱에서 직접 읽을 일이 없다.
ALTER TABLE google_place_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_place_hours ENABLE ROW LEVEL SECURITY;
