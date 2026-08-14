-- 코스 표시용 단순화 경로 — 실도로 스냅 경로를 Douglas-Peucker 로 단순화한
-- 좌표열([lng, lat][], 50~100점). 실도로의 굵은 형상은 따르되 세부 지그재그와
-- 왕복 겹침이 뭉개져 지도에서 한 줄로 읽힌다.
-- 값 채우기는 scripts/rewrite-course-sections.mjs 가 담당.

alter table public.courses
  add column if not exists route_geometry jsonb;

comment on column public.courses.route_geometry is '표시용 단순화 경로 [lng,lat][] — 실도로 스냅을 단순화한 것, 내비에는 쓰지 않는다';
