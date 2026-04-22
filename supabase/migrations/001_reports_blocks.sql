-- ============================================================
-- 신고(reports) 및 차단(blocks) 테이블 + RLS
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 신고 테이블
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('review', 'course_review', 'place', 'course', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'inappropriate', 'fake', 'abuse', 'copyright', 'other')),
  description text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

-- 로그인한 유저는 신고 INSERT 가능 (본인 id로만)
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert
  with check (auth.uid() = reporter_id);

-- 본인이 신고한 내역만 SELECT 가능 (중복 신고 방지 UI용)
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select
  using (auth.uid() = reporter_id);

-- UPDATE/DELETE 불가 (운영자는 service_role로만 처리)


-- 2. 차단 테이블
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);

alter table public.blocks enable row level security;

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert
  with check (auth.uid() = blocker_id);

drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select
  using (auth.uid() = blocker_id);

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete
  using (auth.uid() = blocker_id);
