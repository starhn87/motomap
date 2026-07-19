-- 코스를 "구간(길)" 모델로 전환 — 세세한 경유지 나열 대신
-- "어디서 어디까지, 무슨 길"이 코스의 정체성이 된다.
-- 값 채우기는 scripts/rewrite-course-sections.mjs 가 담당 (마이그레이션은 컬럼만).

alter table public.courses
  add column if not exists section_from text,
  add column if not exists section_to text,
  add column if not exists route_name text;

comment on column public.courses.section_from is '구간 시작 지명 (예: 양수리)';
comment on column public.courses.section_to is '구간 끝 지명 (예: 청평)';
comment on column public.courses.route_name is '타는 길 이름 (예: 북한강로(45번 국도)) — 불명확하면 null';
