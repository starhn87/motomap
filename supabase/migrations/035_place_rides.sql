-- 장소별 라이딩 기록 — 그 장소를 도착지(또는 경유지)로 길안내를 마치고
-- 도착지 300m 안에서 끝난 라이딩을 1회로 센다. 장소 상세에 "라이딩 N회"로
-- 보여주고, 나중에 "이 장소를 달린 바이크들"(기종 조인)의 재료가 된다.
--
-- 스팸 방지를 위해 로그인 라이더만 기록한다(비로그인 주행은 세지 않음).
-- 같은 장소를 여러 번 달리면 매번 +1 — "몇 번 라이딩했는지"가 목적이라 중복이 곧 값이다.

create table public.place_rides (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- goal: 도착지로 달림, via: 그 라이딩의 경유지였음
  role text not null default 'goal' check (role in ('goal', 'via')),
  created_at timestamptz not null default now()
);

create index place_rides_place_idx on public.place_rides (place_id);

alter table public.place_rides enable row level security;

-- 카운트는 공개(장소 상세 누구나), 기록은 본인 것만
create policy "place_rides_select_all" on public.place_rides
  for select using (true);
create policy "place_rides_insert_own" on public.place_rides
  for insert with check (auth.uid() = user_id);
