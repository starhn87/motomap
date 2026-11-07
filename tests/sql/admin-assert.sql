\set ON_ERROR_STOP on
-- 임시 로컬 클러스터 전용. 운영 DB에서 실행하지 않는다.
create function pg_temp.check_it(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'admin sql assertion failed: %', message;
  end if;
end $$;

select pg_temp.check_it((
  select prosecdef = false and pronamespace = 'public'::regnamespace
  from pg_proc
  where proname = 'apply_admin_place_decision'
), 'place decision must be invoker in public');

select pg_temp.check_it(
  not has_table_privilege('anon', 'public.admin_audit_log', 'select')
  and not has_table_privilege('authenticated', 'public.admin_manual_items', 'insert')
  and not has_function_privilege('anon', 'public.apply_admin_place_decision(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.save_admin_pm_recommendation(uuid,text,uuid,text,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.apply_admin_place_decision(uuid,text,uuid)', 'execute'),
  'client roles must not touch admin storage'
);

set role service_role;
select pg_temp.check_it(
  (public.apply_admin_place_decision(
    '11111111-1111-4111-8111-111111111111', 'approve', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) ->> 'result') = 'approve',
  'first approve'
);
select pg_temp.check_it(
  (public.apply_admin_place_decision(
    '11111111-1111-4111-8111-111111111111', 'approve', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) ->> 'result') = 'already_processed',
  'second approve is a no-op'
);
select pg_temp.check_it(
  (public.apply_admin_place_decision(
    '22222222-2222-4222-8222-222222222222', 'reject', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) ->> 'result') = 'reject',
  'reject'
);
select pg_temp.check_it(
  (public.apply_admin_place_decision(
    '55555555-5555-4555-8555-555555555555', 'approve', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) ->> 'result') = 'not_pending',
  'null approved is not pending'
);
select pg_temp.check_it(
  (public.apply_admin_place_decision(
    '66666666-6666-4666-8666-666666666666', 'reject', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) ->> 'result') = 'not_submission',
  'catalog row is not a submission'
);
reset role;

select pg_temp.check_it((select count(*) = 1 from public.place_notices where place_id = '11111111-1111-4111-8111-111111111111' and kind = 'approved'), 'one approval notice');
select pg_temp.check_it((select count(*) = 1 from public.place_notices where place_id = '22222222-2222-4222-8222-222222222222' and kind = 'rejected'), 'one rejection notice');
select pg_temp.check_it((select count(*) = 1 from public.place_notices where place_id = '33333333-3333-4333-8333-333333333333' and kind = 'approved'), 'concurrent approve sends one notice');
select pg_temp.check_it((select approved is true from public.places where id = '11111111-1111-4111-8111-111111111111'), 'approved flag');
select pg_temp.check_it((select rejected_reason = '너무 위험합니다' and deleted_at is not null from public.places where id = '22222222-2222-4222-8222-222222222222'), 'reject copies ai reason');
select pg_temp.check_it((select approved is null from public.places where id = '55555555-5555-4555-8555-555555555555'), 'null approval unchanged');
select pg_temp.check_it((select count(*) = 2 from public.admin_audit_log where target_id = '33333333-3333-4333-8333-333333333333'), 'race writes two audit rows');
select pg_temp.check_it((select count(*) = 2 from public.admin_audit_log where target_id = '11111111-1111-4111-8111-111111111111'), 'duplicate click is audited');

set role anon;
do $$
begin
  begin
    perform 1 from public.admin_audit_log;
    raise exception 'anon read accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
