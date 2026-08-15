-- 기존 delete_my_account()는 프로필 이름만 바꾸고 Auth 계정과 개인 데이터를
-- 남겼다. 실제 탈퇴는 인증된 Edge Function이 이 준비 함수를 service_role로 호출한
-- 뒤 Auth 사용자를 soft-delete한다.

alter table public.course_reviews
  drop constraint if exists course_reviews_profile_fk,
  add constraint course_reviews_profile_fk
    foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.course_reviews
  drop constraint if exists course_reviews_user_id_fkey,
  add constraint course_reviews_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.courses
  drop constraint if exists courses_created_by_fkey,
  add constraint courses_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.feedback
  drop constraint if exists feedback_user_id_fkey,
  add constraint feedback_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.places
  drop constraint if exists places_submitted_by_fkey,
  add constraint places_submitted_by_fkey
    foreign key (submitted_by) references auth.users(id) on delete set null;

alter table public.reviews
  drop constraint if exists reviews_profile_fk,
  add constraint reviews_profile_fk
    foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.reviews
  drop constraint if exists reviews_user_id_fkey,
  add constraint reviews_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.road_hazards alter column reported_by drop not null;
alter table public.road_hazards
  drop constraint if exists road_hazards_reported_by_fkey,
  add constraint road_hazards_reported_by_fkey
    foreign key (reported_by) references auth.users(id) on delete set null;

drop policy if exists "road_hazards 조회는 제보자만" on public.road_hazards;
create policy "road_hazards 조회는 제보자만" on public.road_hazards
  for select
  to authenticated
  using ((select auth.uid()) = reported_by);

drop policy if exists "road_hazards 제보는 로그인 사용자" on public.road_hazards;
create policy "road_hazards 제보는 로그인 사용자" on public.road_hazards
  for insert
  to authenticated
  with check ((select auth.uid()) = reported_by);

drop policy if exists "road_hazards 수정은 본인만" on public.road_hazards;
create policy "road_hazards 수정은 본인만" on public.road_hazards
  for update
  to authenticated
  using ((select auth.uid()) = reported_by)
  with check ((select auth.uid()) = reported_by);

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- 공개 기여는 내용만 보존하고 작성자·사진 연결을 제거한다.
  update public.reviews
  set user_id = null, user_name = '탈퇴한 사용자', photos = '{}'::text[]
  where user_id = p_user_id;

  update public.course_reviews
  set user_id = null, user_name = '탈퇴한 사용자'
  where user_id = p_user_id;

  update public.places set submitted_by = null where submitted_by = p_user_id;
  update public.courses set created_by = null where created_by = p_user_id;
  update public.road_hazards
  set reported_by = null, photo = null
  where reported_by = p_user_id;

  -- 개인 데이터는 보존하지 않는다. 투표 집계는 남은 표로 다시 계산한다.
  with deleted_votes as (
    delete from public.hazard_votes
    where user_id = p_user_id
    returning hazard_id
  )
  update public.road_hazards h
  set
    confirm_count = (
      select count(*)::integer from public.hazard_votes v
      where v.hazard_id = h.id and v.kind = 'confirm'
    ),
    resolved_count = (
      select count(*)::integer from public.hazard_votes v
      where v.hazard_id = h.id and v.kind = 'resolve'
    )
  where h.id in (select hazard_id from deleted_votes);

  delete from public.blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  delete from public.favorites where user_id = p_user_id;
  delete from public.feedback where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.place_rides where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.reports
  where reporter_id = p_user_id
     or (target_type = 'user' and target_id = p_user_id);
  delete from public.review_likes where user_id = p_user_id;
  delete from public.rides where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- 구버전 앱이 프로필 익명화만 하고 탈퇴 성공으로 오인하지 않게 명시적으로 막는다.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  raise exception '앱을 업데이트한 뒤 다시 시도해주세요.';
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
