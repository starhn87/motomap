-- 제보 원본을 수정하지 않고 본인 활동 목록에서만 숨긴다.
create table public.activity_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('place_submission', 'feedback')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.activity_dismissals enable row level security;
revoke all on public.activity_dismissals from public, anon, authenticated;
grant select, insert on public.activity_dismissals to authenticated;
grant all on public.activity_dismissals to service_role;

create policy activity_dismissals_select_own on public.activity_dismissals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy activity_dismissals_insert_own on public.activity_dismissals
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (
      (kind = 'place_submission' and exists (
        select 1 from public.places p where p.id = target_id and p.submitted_by = (select auth.uid())
      )) or
      (kind = 'feedback' and exists (
        select 1 from public.feedback f where f.id = target_id and f.user_id = (select auth.uid())
      ))
    )
  );

-- 공개 승인 여부와 무관하게 제보자는 자신의 검토 결과를 볼 수 있다.
create policy places_select_own_submission on public.places for select to authenticated
  using ((select auth.uid()) = submitted_by);

-- 기존 SELECT 정책과 함께 본인 알림 한정 DELETE를 허용한다.
grant delete on public.notifications to authenticated;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using ((select auth.uid()) = user_id);
