-- 리뷰의 바이크는 작성 당시 관점이다. profiles.bike_model을 조회 때 조인하면
-- 사용자가 기종을 바꿀 때 과거 리뷰까지 소급해서 바뀌므로 행 자체에 고정한다.

alter table public.reviews add column if not exists bike_model text;
alter table public.course_reviews add column if not exists bike_model text;

comment on column public.reviews.bike_model is '리뷰 작성 당시 바이크 기종 스냅샷';
comment on column public.course_reviews.bike_model is '리뷰 작성 당시 바이크 기종 스냅샷';

-- 과거 행에는 작성 시점 값을 복원할 수 없으므로 현재 프로필 값으로 1회 최선 백필한다.
update public.reviews r
set bike_model = p.bike_model
from public.profiles p
where r.user_id = p.id and r.bike_model is null;

update public.course_reviews r
set bike_model = p.bike_model
from public.profiles p
where r.user_id = p.id and r.bike_model is null;

create or replace function public.set_review_bike_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 한 번 작성된 리뷰의 관점은 프로필이나 활성 바이크 변경과 무관하게 고정한다.
  if tg_op = 'UPDATE' then
    new.bike_model := old.bike_model;
    return new;
  end if;

  new.bike_model := nullif(btrim(new.bike_model), '');
  if new.bike_model is null and new.user_id is not null then
    select p.bike_model into new.bike_model
    from public.profiles p
    where p.id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_bike_snapshot on public.reviews;
create trigger reviews_bike_snapshot
before insert or update on public.reviews
for each row execute function public.set_review_bike_snapshot();

drop trigger if exists course_reviews_bike_snapshot on public.course_reviews;
create trigger course_reviews_bike_snapshot
before insert or update on public.course_reviews
for each row execute function public.set_review_bike_snapshot();

revoke all on function public.set_review_bike_snapshot() from public, anon, authenticated;
grant execute on function public.set_review_bike_snapshot() to service_role;
