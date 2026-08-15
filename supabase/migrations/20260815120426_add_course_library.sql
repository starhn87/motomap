-- 코스를 다시 찾을 수 있도록 저장하고, 실제 안내 도착을 완주 기록으로 쌓는다.

create table public.course_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table public.course_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  bike_id uuid references public.user_bikes(id) on delete set null,
  bike_model text,
  completed_at timestamptz not null default now()
);

create index course_saves_course_id_idx on public.course_saves(course_id);
create index course_completions_user_course_idx
  on public.course_completions(user_id, course_id, completed_at desc);
create index course_completions_course_id_idx on public.course_completions(course_id);

alter table public.course_saves enable row level security;
alter table public.course_completions enable row level security;

create policy "course_saves_select_own" on public.course_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "course_saves_insert_own" on public.course_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "course_saves_delete_own" on public.course_saves
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "course_completions_select_own" on public.course_completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "course_completions_delete_own" on public.course_completions
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.course_saves from public, anon;
revoke all on table public.course_completions from public, anon;
grant select, insert, delete on table public.course_saves to authenticated;
grant select, delete on table public.course_completions to authenticated;
grant all on table public.course_saves to service_role;
grant all on table public.course_completions to service_role;

-- SDK 종료 이벤트 중복에 대비해 같은 코스의 30분 이내 재호출은 한 번만 센다.
create or replace function public.record_course_completion(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  active_bike_id uuid;
  active_model text;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.courses
    where id = p_course_id and approved = true and deleted_at is null
  ) then
    raise exception 'course not found';
  end if;
  if exists (
    select 1 from public.course_completions
    where user_id = current_user_id
      and course_id = p_course_id
      and completed_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;

  select b.id, b.model into active_bike_id, active_model
  from public.user_bikes b
  where b.user_id = current_user_id and b.is_active
  limit 1;

  insert into public.course_completions (user_id, course_id, bike_id, bike_model)
  values (
    current_user_id,
    p_course_id,
    active_bike_id,
    coalesce(
      active_model,
      (select p.bike_model from public.profiles p where p.id = current_user_id)
    )
  );
  return true;
end;
$$;

revoke all on function public.record_course_completion(uuid) from public, anon;
grant execute on function public.record_course_completion(uuid) to authenticated;
grant execute on function public.record_course_completion(uuid) to service_role;
