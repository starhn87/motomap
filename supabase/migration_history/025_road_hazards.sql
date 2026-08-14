-- 노면 위험 제보: 라이더를 넘어뜨리는 것들(모래·기름·포트홀·낙석·결빙·공사)을
-- 지도와 코스, 안내 시작 시점에 경고한다.
--
-- 장소 제보와 달리 승인 대기를 두지 않는다 — 위험 정보는 시의성이 생명이라
-- 대기하는 순간 의미가 죽는다. 대신 신선도로 신뢰를 관리한다:
--   * 유형별 수명(fresh_days)을 넘기면 흐려지고, 두 배를 넘기면 목록에서 빠진다
--   * "아직 있어요"(confirm)로 수명이 되살아나고, "없어졌어요"(resolve) 2표면 숨는다
--   * 삭제가 아니라 숨김이라, 나중에 누가 다시 확인하면 살아난다

CREATE TABLE IF NOT EXISTS public.road_hazards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location geography(POINT, 4326) NOT NULL,
  type text NOT NULL CHECK (
    type IN ('sand', 'oil', 'pothole', 'rockfall', 'ice', 'construction', 'etc')
  ),
  note text,
  photo text,
  address text,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirm_count integer NOT NULL DEFAULT 0,
  resolved_count integer NOT NULL DEFAULT 0,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS road_hazards_location_idx ON public.road_hazards USING GIST (location);

-- 한 사람이 같은 제보에 한 번만 투표한다 (kind 를 바꾸면 갱신)
CREATE TABLE IF NOT EXISTS public.hazard_votes (
  hazard_id uuid NOT NULL REFERENCES public.road_hazards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('confirm', 'resolve')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hazard_id, user_id)
);

ALTER TABLE public.road_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "road_hazards 조회는 누구나" ON public.road_hazards;
CREATE POLICY "road_hazards 조회는 누구나" ON public.road_hazards
  FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "road_hazards 제보는 로그인 사용자" ON public.road_hazards;
CREATE POLICY "road_hazards 제보는 로그인 사용자" ON public.road_hazards
  FOR INSERT WITH CHECK (auth.uid() = reported_by);

DROP POLICY IF EXISTS "road_hazards 수정은 본인만" ON public.road_hazards;
CREATE POLICY "road_hazards 수정은 본인만" ON public.road_hazards
  FOR UPDATE USING (auth.uid() = reported_by);

DROP POLICY IF EXISTS "hazard_votes 조회는 본인 것만" ON public.hazard_votes;
CREATE POLICY "hazard_votes 조회는 본인 것만" ON public.hazard_votes
  FOR SELECT USING (auth.uid() = user_id);

-- 유형별 수명(일). 결빙·기름·공사는 금방 해소되고, 모래·포트홀·낙석은 오래 간다.
CREATE OR REPLACE FUNCTION public.hazard_fresh_days(hazard_type text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE hazard_type
    WHEN 'ice' THEN 14
    WHEN 'oil' THEN 14
    WHEN 'construction' THEN 30
    ELSE 120
  END;
$function$;

-- 살아있는(숨김 조건에 걸리지 않은) 위험만 추린 뷰 —
-- staleness: 0 신선 / 1 오래됨(흐리게 표시)
CREATE OR REPLACE VIEW public.live_road_hazards AS
  SELECT
    h.*,
    ST_Y(h.location::geometry) AS latitude,
    ST_X(h.location::geometry) AS longitude,
    CASE
      WHEN h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) || ' days')::interval
      THEN 0 ELSE 1
    END AS staleness
  FROM public.road_hazards h
  WHERE h.deleted_at IS NULL
    AND h.resolved_count < 2
    AND h.last_confirmed_at > now() - (public.hazard_fresh_days(h.type) * 2 || ' days')::interval;

-- 반경 내 위험 (지도용)
CREATE OR REPLACE FUNCTION public.nearby_hazards(
  lat double precision,
  lng double precision,
  radius_meters integer DEFAULT 20000
)
 RETURNS TABLE(
   id uuid, type text, note text, photo text, address text,
   latitude double precision, longitude double precision,
   reported_by uuid, created_at timestamptz, last_confirmed_at timestamptz,
   confirm_count integer, resolved_count integer, staleness integer
 )
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    h.id, h.type, h.note, h.photo, h.address,
    h.latitude, h.longitude,
    h.reported_by, h.created_at, h.last_confirmed_at,
    h.confirm_count, h.resolved_count, h.staleness
  FROM public.live_road_hazards h
  WHERE ST_DWithin(h.location, ST_MakePoint(lng, lat)::geography, radius_meters)
  ORDER BY ST_Distance(h.location, ST_MakePoint(lng, lat)::geography);
$function$;

-- 코스 경로선 주변 위험 — places_near_course 와 같은 방식(진행 순서 정렬)
CREATE OR REPLACE FUNCTION public.hazards_near_course(
  course_id uuid,
  radius_m integer DEFAULT 500
)
 RETURNS TABLE(
   id uuid, type text, note text, photo text, address text,
   latitude double precision, longitude double precision,
   reported_by uuid, created_at timestamptz, last_confirmed_at timestamptz,
   confirm_count integer, resolved_count integer, staleness integer,
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
    h.id, h.type, h.note, h.photo, h.address,
    h.latitude, h.longitude,
    h.reported_by, h.created_at, h.last_confirmed_at,
    h.confirm_count, h.resolved_count, h.staleness,
    ST_LineLocatePoint(cl.line, h.location::geometry) AS route_fraction
  FROM public.live_road_hazards h, course_line cl
  WHERE ST_DWithin(h.location, cl.line::geography, radius_m)
  ORDER BY route_fraction;
$function$;

-- "아직 있어요"/"없어졌어요" — 한 사람 한 표, 바꾸면 이전 표를 되돌린다
CREATE OR REPLACE FUNCTION public.vote_hazard(hazard_id uuid, vote_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  previous text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF vote_kind NOT IN ('confirm', 'resolve') THEN
    RAISE EXCEPTION '잘못된 값입니다.';
  END IF;

  SELECT kind INTO previous FROM hazard_votes v
   WHERE v.hazard_id = vote_hazard.hazard_id AND v.user_id = auth.uid();

  IF previous = vote_kind THEN
    RETURN; -- 같은 표 반복은 무시
  END IF;

  INSERT INTO hazard_votes (hazard_id, user_id, kind)
  VALUES (vote_hazard.hazard_id, auth.uid(), vote_kind)
  ON CONFLICT (hazard_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();

  -- 이전 표 되돌리기
  IF previous = 'confirm' THEN
    UPDATE road_hazards SET confirm_count = GREATEST(confirm_count - 1, 0)
     WHERE id = vote_hazard.hazard_id;
  ELSIF previous = 'resolve' THEN
    UPDATE road_hazards SET resolved_count = GREATEST(resolved_count - 1, 0)
     WHERE id = vote_hazard.hazard_id;
  END IF;

  IF vote_kind = 'confirm' THEN
    UPDATE road_hazards
       SET confirm_count = confirm_count + 1, last_confirmed_at = now()
     WHERE id = vote_hazard.hazard_id;
  ELSE
    UPDATE road_hazards SET resolved_count = resolved_count + 1
     WHERE id = vote_hazard.hazard_id;
  END IF;
END;
$function$;
