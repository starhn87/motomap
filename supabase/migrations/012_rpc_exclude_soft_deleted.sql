-- all_places / nearby_places 가 soft delete 된 행을 노출하는 버그 수정.
--
-- 007 은 "RPC 가 approved=true 만 반환하니 soft delete 는 안전"이라 가정했지만,
-- 이는 반려(승인 전) 시나리오만 맞다. 이미 승인된 장소를 나중에 soft delete 하면
-- approved=true + deleted_at 상태가 되어 지도·검색·추천·AI 챗에 그대로 노출됐다
-- (2026-07 데이터 감사에서 삭제한 3곳이 실제 노출된 것을 AI 챗 검증에서 발견).
-- 두 RPC 의 WHERE 에 deleted_at IS NULL 을 추가한다 (원 정의는 원격에서 조회해 보존).

CREATE OR REPLACE FUNCTION public.all_places(category_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, category text, latitude double precision, longitude double precision, address text, phone text, photos text[], rating numeric, review_count integer, tags text[], opening_hours text, parking_info text, submitted_by uuid, approved boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
      p.id, p.name, p.description, p.category,
      ST_Y(p.location::geometry) AS latitude,
      ST_X(p.location::geometry) AS longitude,
      p.address, p.phone, p.photos, p.rating, p.review_count,
      p.tags, p.opening_hours, p.parking_info,
      p.submitted_by, p.approved, p.created_at
    FROM places p
    WHERE p.approved = true
      AND p.deleted_at IS NULL
      AND (category_filter IS NULL OR p.category = category_filter)
    ORDER BY p.created_at DESC;
  $function$;

CREATE OR REPLACE FUNCTION public.nearby_places(lat double precision, lng double precision, radius_meters integer DEFAULT 5000, category_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, category text, latitude double precision, longitude double precision, address text, phone text, photos text[], rating numeric, review_count integer, tags text[], opening_hours text, parking_info text, submitted_by uuid, approved boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
      p.id, p.name, p.description, p.category,
      ST_Y(p.location::geometry) AS latitude,
      ST_X(p.location::geometry) AS longitude,
      p.address, p.phone, p.photos, p.rating, p.review_count,
      p.tags, p.opening_hours, p.parking_info,
      p.submitted_by, p.approved, p.created_at
    FROM places p
    WHERE p.approved = true
      AND p.deleted_at IS NULL
      AND ST_DWithin(p.location, ST_MakePoint(lng, lat)::geography, radius_meters)
      AND (category_filter IS NULL OR p.category = category_filter)
    ORDER BY ST_Distance(p.location, ST_MakePoint(lng, lat)::geography);
  $function$;
