-- 에어코리아 응답 캐시 (air-kr Edge Function 전용)
--
-- EF 의 메모리 캐시는 인스턴스가 유휴로 내려갈 때마다 증발해, 호출이 뜸한
-- 앱 특성상 사실상 매번 미스가 났다(에어코리아 원 API 는 실측 10~26초).
-- 측정값은 시간 단위 갱신이므로 30분 지속 캐시로 충분하다.
--
-- RLS 를 켜고 정책을 만들지 않는다 — anon/authenticated 는 접근 불가,
-- EF 는 service role 로 우회한다.

create table if not exists public.air_cache (
  key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.air_cache enable row level security;
