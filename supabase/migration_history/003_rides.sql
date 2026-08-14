-- ============================================================
-- 주행 기록(rides) 테이블 + RLS
-- Supabase SQL Editor에서 실행
-- ============================================================

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  coordinates jsonb not null default '[]'::jsonb,  -- [lng, lat][]
  distance numeric not null default 0,   -- km
  duration int not null default 0,       -- 초
  avg_speed numeric not null default 0,  -- km/h
  max_speed numeric not null default 0,  -- km/h
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rides_user_idx on public.rides (user_id, created_at desc);

alter table public.rides enable row level security;

-- 본인 주행만 조회
drop policy if exists rides_select_own on public.rides;
create policy rides_select_own on public.rides
  for select
  using (auth.uid() = user_id);

-- 본인 id로만 저장
drop policy if exists rides_insert_own on public.rides;
create policy rides_insert_own on public.rides
  for insert
  with check (auth.uid() = user_id);

-- 본인 주행만 수정 (제목 변경)
drop policy if exists rides_update_own on public.rides;
create policy rides_update_own on public.rides
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인 주행만 삭제
drop policy if exists rides_delete_own on public.rides;
create policy rides_delete_own on public.rides
  for delete
  using (auth.uid() = user_id);
