-- 코스 근처 장소: 코스 경로선 반경 radius_m 이내의 승인 장소를
-- "코스 진행 순서"(경로상 진행도)로 반환한다. 코스 상세의 근처 장소 섹션용.
--
-- 경로는 route_geometry(실도로 스냅 후 단순화한 표시용 선)를 우선 쓰고,
-- 없으면 coordinates(등록 좌표)로 폴백한다. 둘 다 [[lng, lat], ...] jsonb.
-- route_fraction 은 ST_LineLocatePoint 의 0~1 값 — 코스에서 그 장소가
-- 몇 % 지점에 있는지(초반/중반/후반 힌트와 정렬에 사용).

CREATE OR REPLACE FUNCTION public.places_near_course(
  course_id uuid,
  radius_m integer DEFAULT 3000,
  max_results integer DEFAULT 20
)
 RETURNS TABLE(
   id uuid, name text, description text, category text,
   latitude double precision, longitude double precision,
   address text, phone text, photos text[], rating numeric,
   review_count integer, tags text[], opening_hours text, parking_info text,
   submitted_by uuid, approved boolean, created_at timestamp with time zone,
   route_fraction double precision
 )
 LANGUAGE sql
 STABLE
AS $function$
    WITH course_line AS (
      SELECT ST_SetSRID(
        ST_MakeLine(ARRAY(
          SELECT ST_MakePoint((pt->>0)::float8, (pt->>1)::float8)
          FROM jsonb_array_elements(COALESCE(c.route_geometry, c.coordinates)) AS pt
        )), 4326
      ) AS line
      FROM courses c
      WHERE c.id = course_id
    )
    SELECT
      p.id, p.name, p.description, p.category,
      ST_Y(p.location::geometry) AS latitude,
      ST_X(p.location::geometry) AS longitude,
      p.address, p.phone, p.photos, p.rating, p.review_count,
      p.tags, p.opening_hours, p.parking_info,
      p.submitted_by, p.approved, p.created_at,
      ST_LineLocatePoint(cl.line, p.location::geometry) AS route_fraction
    FROM places p, course_line cl
    WHERE p.approved = true
      AND p.deleted_at IS NULL
      AND ST_DWithin(p.location, cl.line::geography, radius_m)
    ORDER BY route_fraction
    LIMIT max_results;
  $function$;
