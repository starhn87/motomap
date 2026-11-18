\set ON_ERROR_STOP on
-- 격리된 빈 로컬 PostgreSQL에서만 실행한다. 운영 DB에서는 실행하지 않는다.
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.places(id uuid primary key, submitted_by uuid, approved boolean);
create table public.feedback(id uuid primary key, user_id uuid);
create table public.notifications(id uuid primary key, user_id uuid);
alter table public.places enable row level security;
alter table public.feedback enable row level security;
alter table public.notifications enable row level security;
grant select on public.places to anon, authenticated;
grant select on public.feedback to authenticated;
grant select, delete on public.notifications to anon, authenticated;
create policy places_public on public.places for select using (approved);
create policy feedback_own on public.feedback for select using (user_id = auth.uid());
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into places values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',false),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',false),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',true);
insert into feedback values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into notifications values
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
\ir ../../supabase/migrations/20261103153229_add_activity_dismissals_and_notification_delete.sql
create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'activity access assertion failed'; end if; end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check_it((select count(*) = 2 from places));
insert into activity_dismissals(user_id,kind,target_id) values
  (auth.uid(),'place_submission','10000000-0000-0000-0000-000000000001'),
  (auth.uid(),'feedback','20000000-0000-0000-0000-000000000001');
insert into activity_dismissals(user_id,kind,target_id) values
  (auth.uid(),'place_submission','10000000-0000-0000-0000-000000000001') on conflict do nothing;
select pg_temp.check_it((select count(*) = 2 from activity_dismissals));
do $$begin
  begin
    insert into activity_dismissals(user_id,kind,target_id) values
      (auth.uid(),'place_submission','10000000-0000-0000-0000-000000000003');
    raise exception 'other owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into activity_dismissals(user_id,kind,target_id) values
      ('00000000-0000-0000-0000-000000000002','feedback','20000000-0000-0000-0000-000000000001');
    raise exception 'spoofed actor accepted';
  exception when insufficient_privilege then null; end;
end $$;
delete from notifications where id = '30000000-0000-0000-0000-000000000002';
select pg_temp.check_it((select count(*) = 1 from notifications));
delete from notifications where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.check_it((select count(*) = 0 from notifications));
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.check_it((select count(*) = 0 from activity_dismissals));
select pg_temp.check_it((select count(*) = 1 from notifications));
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.check_it((select count(*) = 1 from places));
do $$begin
  begin perform 1 from activity_dismissals; raise exception 'anon read accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_it((select count(*) = 3 from places));
select pg_temp.check_it((select count(*) = 1 from feedback));
rollback;
\echo 'activity RLS / owner hide / idempotency / delete isolation / source preservation PASS'
