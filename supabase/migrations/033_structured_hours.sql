-- 영업시간을 구조화한다. "지금 영업중"을 계산하려면 자유 텍스트로는 안 된다.
--
-- 기존 opening_hours(text)는 남긴다 — 원문이 곧 사람이 쓴 뉘앙스라, 구조화가
-- 못 담는 표현("LO 24:00", "우천 휴무")을 그대로 보여주는 데 쓴다. hours 가
-- 있으면 계산에, 없으면 원문만 표시하는 이중 구조.
--
-- 형식:
--   {"mon": [{"open":"11:00","close":"02:00"}], "tue": [], "wed": null, ..., "note": "우천 휴무"}
--     구간 배열 — 브레이크타임(11:00-15:00, 17:00-22:00)이 흔해서 여러 개를 받는다
--     []   그날 휴무 (확정)
--     null / 키 없음 = 모름 (판정하지 않는다)
--     close < open 이면 익일로 넘어가는 영업 (14:00-01:00)
--     "24:00" 은 자정

ALTER TABLE places ADD COLUMN IF NOT EXISTS hours jsonb;

COMMENT ON COLUMN places.hours IS
  '요일별 영업 구간. mon~sun 키에 [{open,close}] 배열, []는 휴무, null은 모름. note에 조건부 휴무 등 비고.';

-- 기존 7건 변환. 원문은 opening_hours 에 그대로 남아 있다.
UPDATE places SET hours = '{
  "mon": [], "tue": [{"open":"12:30","close":"20:00"}], "wed": [{"open":"12:30","close":"20:00"}],
  "thu": [{"open":"12:30","close":"20:00"}], "fri": [{"open":"12:30","close":"20:00"}],
  "sat": [{"open":"12:30","close":"20:00"}], "sun": [{"open":"12:30","close":"20:00"}]
}'::jsonb WHERE id = '574ab2a6-d4aa-4912-94a5-8b12470a2018';  -- 바이크루 원주점

-- 돈키호테 1988: 원문 "매일 10:00- (월 휴무)" — 마감 시각이 없어 영업중 판정을
-- 할 수 없다. 월요일 휴무만 확정으로 넣고 나머지는 모름으로 둔다.
UPDATE places SET hours = '{
  "mon": [], "note": "10:00 오픈 · 마감 시간 미확인"
}'::jsonb WHERE id = '45877d0d-b367-4cb6-a638-3c53af86a8cc';

UPDATE places SET hours = '{
  "mon": [{"open":"18:00","close":"24:00"}], "tue": [{"open":"18:00","close":"24:00"}],
  "wed": [{"open":"18:00","close":"24:00"}], "thu": [{"open":"18:00","close":"24:00"}],
  "fri": [{"open":"18:00","close":"24:00"}], "sat": [{"open":"18:00","close":"24:00"}],
  "sun": [{"open":"18:00","close":"24:00"}], "note": "우천 휴무"
}'::jsonb WHERE id = '9608634b-9316-4901-acc8-140fbeb7b246';  -- 뱅어스

UPDATE places SET hours = '{
  "mon": [{"open":"14:00","close":"01:00"}], "tue": [{"open":"14:00","close":"01:00"}],
  "wed": [{"open":"14:00","close":"01:00"}], "thu": [{"open":"14:00","close":"01:00"}],
  "fri": [{"open":"14:00","close":"01:00"}], "sat": [{"open":"14:00","close":"01:00"}],
  "sun": [{"open":"14:00","close":"01:00"}], "note": "라스트오더 24:00"
}'::jsonb WHERE id = '806f4964-700e-4d46-aa57-25e51ed17d91';  -- 귀산라이더카페 브룸

UPDATE places SET hours = '{
  "mon": [{"open":"12:00","close":"24:00"}], "tue": [{"open":"12:00","close":"24:00"}],
  "wed": [{"open":"12:00","close":"24:00"}], "thu": [{"open":"12:00","close":"24:00"}],
  "fri": [{"open":"12:00","close":"24:00"}], "sat": [{"open":"12:00","close":"24:00"}],
  "sun": [{"open":"12:00","close":"24:00"}]
}'::jsonb WHERE id = '2d71192c-4ac6-4e32-9a9c-0d0f44dd0446';  -- 모토매니아카페

UPDATE places SET hours = '{
  "mon": [], "tue": [], "wed": [{"open":"10:00","close":"18:00"}],
  "thu": [{"open":"10:00","close":"18:00"}], "fri": [{"open":"10:00","close":"18:00"}],
  "sat": [{"open":"10:00","close":"18:00"}], "sun": [{"open":"10:00","close":"18:00"}]
}'::jsonb WHERE id = '930bc84e-7fd2-419b-b5ee-7cbf4efbad91';  -- 카페 모토라드 합천

UPDATE places SET hours = '{
  "mon": [{"open":"11:00","close":"02:00"}], "tue": [{"open":"11:00","close":"02:00"}],
  "wed": [{"open":"11:00","close":"02:00"}], "thu": [{"open":"11:00","close":"02:00"}],
  "fri": [{"open":"11:00","close":"02:00"}], "sat": [{"open":"10:00","close":"02:00"}],
  "sun": [{"open":"10:00","close":"24:00"}], "note": "우천 휴무"
}'::jsonb WHERE id = '3834ac34-5ec7-4495-a7a4-5b1251d23ee8';  -- 할리우드

-- RPC 두 개에 hours 를 실어 보낸다. 반환 타입이 바뀌므로 REPLACE 로는 안 되고
-- DROP 이 필요하다.
DROP FUNCTION IF EXISTS public.all_places(text);
DROP FUNCTION IF EXISTS public.nearby_places(double precision, double precision, integer, text);

CREATE FUNCTION public.all_places(category_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, category text, latitude double precision, longitude double precision, address text, phone text, photos text[], rating numeric, review_count integer, tags text[], opening_hours text, hours jsonb, parking_info text, submitted_by uuid, approved boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
      p.id, p.name, p.description, p.category,
      ST_Y(p.location::geometry) AS latitude,
      ST_X(p.location::geometry) AS longitude,
      p.address, p.phone, p.photos, p.rating, p.review_count,
      p.tags, p.opening_hours, p.hours, p.parking_info,
      p.submitted_by, p.approved, p.created_at
    FROM places p
    WHERE p.approved = true
      AND p.deleted_at IS NULL
      AND (category_filter IS NULL OR p.category = category_filter)
    ORDER BY p.created_at DESC;
  $function$;

CREATE FUNCTION public.nearby_places(lat double precision, lng double precision, radius_meters integer DEFAULT 5000, category_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, category text, latitude double precision, longitude double precision, address text, phone text, photos text[], rating numeric, review_count integer, tags text[], opening_hours text, hours jsonb, parking_info text, submitted_by uuid, approved boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
      p.id, p.name, p.description, p.category,
      ST_Y(p.location::geometry) AS latitude,
      ST_X(p.location::geometry) AS longitude,
      p.address, p.phone, p.photos, p.rating, p.review_count,
      p.tags, p.opening_hours, p.hours, p.parking_info,
      p.submitted_by, p.approved, p.created_at
    FROM places p
    WHERE p.approved = true
      AND p.deleted_at IS NULL
      AND ST_DWithin(p.location, ST_MakePoint(lng, lat)::geography, radius_meters)
      AND (category_filter IS NULL OR p.category = category_filter)
    ORDER BY ST_Distance(p.location, ST_MakePoint(lng, lat)::geography);
  $function$;
