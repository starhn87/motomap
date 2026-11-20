\set ON_ERROR_STOP on
-- 임시 로컬 클러스터 전용. 운영 DB에서 실행하지 않는다.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create table public.places (
  id uuid primary key,
  approved boolean,
  deleted_at timestamptz,
  submitted_by uuid,
  ai_reject_reason text,
  rejected_reason text
);
alter table public.places enable row level security;
grant select, update on public.places to service_role;

create table public.place_notices (
  id integer generated always as identity primary key,
  place_id uuid,
  kind text
);
grant insert on public.place_notices to service_role;
grant usage, select on sequence public.place_notices_id_seq to service_role;
create function public.notice_place() returns trigger
language plpgsql
as $$
begin
  insert into public.place_notices(place_id, kind) values (new.id, tg_argv[0]);
  return new;
end $$;
create trigger places_approval_push after update of approved on public.places
for each row when (old.approved = false and new.approved is true)
execute function public.notice_place('approved');
create trigger places_rejection_push after update of deleted_at on public.places
for each row when (old.deleted_at is null and new.deleted_at is not null and new.approved = false)
execute function public.notice_place('rejected');

\ir ../../supabase/migrations/20261108095543_admin_dashboard_state.sql

insert into public.places(id, approved, submitted_by, ai_reject_reason) values
  ('11111111-1111-4111-8111-111111111111', false, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null),
  ('22222222-2222-4222-8222-222222222222', false, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '너무 위험합니다'),
  ('33333333-3333-4333-8333-333333333333', false, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null),
  ('44444444-4444-4444-8444-444444444444', true, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null),
  ('55555555-5555-4555-8555-555555555555', null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null),
  ('66666666-6666-4666-8666-666666666666', false, null, null);
