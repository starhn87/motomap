\set ON_ERROR_STOP on
begin;
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (id uuid primary key);
insert into public.profiles values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
\ir ../../supabase/migrations/20261112130934_add_account_personal_places.sql

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into public.account_personal_places values
  (auth.uid(), 'home', '{"name":"공개 장소","address":"테스트","latitude":37,"longitude":127}'),
  (auth.uid(), 'work', null);
insert into public.account_personal_places values
  (auth.uid(), 'work', '{"name":"이전 기기","address":"","latitude":37,"longitude":127}')
  on conflict (user_id, slot) do nothing;
do $$
begin
  if (select count(*) from public.account_personal_places where place is not null) <> 1 then
    raise exception 'deleted slot was resurrected by import';
  end if;
  begin
    insert into public.account_personal_places values
      (auth.uid(), 'home', '{"name":"잘못된 좌표","address":"","latitude":999,"longitude":127}')
      on conflict (user_id, slot) do update set place = excluded.place;
    raise exception 'invalid coordinates accepted';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if exists (select from public.account_personal_places) then raise exception 'other account can read'; end if;
  update public.account_personal_places set place = null;
  if found then raise exception 'other account can modify'; end if;
  begin
    insert into public.account_personal_places values ('10000000-0000-0000-0000-000000000001', 'home', null)
      on conflict (user_id, slot) do update set place = excluded.place;
    raise exception 'forged owner accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.account_personal_places;
    raise exception 'anon can access';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

delete from public.profiles where id = '10000000-0000-0000-0000-000000000001';
do $$
begin
  if exists (select from public.account_personal_places) then raise exception 'account deletion left place data'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.account_personal_places values (auth.uid(), 'home', null);
    raise exception 'old session recreated data after account deletion';
  exception when foreign_key_violation then null;
  end;
end $$;
rollback;
