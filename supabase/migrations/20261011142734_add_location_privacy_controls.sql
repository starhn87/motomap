begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 비회원은 기기 비밀값의 해시로만 식별한다. 계정 연결·좌표·주소를 로그에 복제하지 않는다.
create schema location_private;
revoke all on schema location_private from public;
grant usage on schema location_private to anon, authenticated, service_role;
create table location_private.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete cascade,
  device_hash text unique,
  status text not null check (status in ('active','paused','withdrawn')),
  version text not null,
  accepted_at timestamptz,
  history_allowed boolean not null default false,
  providers text[] not null default '{}',
  check ((user_id is null) <> (device_hash is null))
);
create table location_private.usage_events (
  id uuid primary key,
  subject_id uuid not null references location_private.subjects(id) on delete cascade,
  purpose text not null check (purpose in ('map','search','address','weather','gas','route','navigation','ai','arrival')),
  recipient text not null check (recipient in ('device','motomap','naver','kakao','kma','airkorea','opinet','anthropic')),
  outcome text not null check (outcome in ('requested','completed','failed')),
  created_at timestamptz not null default now()
);
create index location_usage_subject_created_idx on location_private.usage_events(subject_id,created_at desc,id);
create index location_usage_expiry_idx on location_private.usage_events(created_at);
alter table location_private.subjects enable row level security;
alter table location_private.usage_events enable row level security;
revoke all on all tables in schema location_private from public,anon,authenticated;
grant all on all tables in schema location_private to service_role;
-- secret를 회전해도 넘을 수 없는 프로젝트 상한. 초과 시 처리 전에 중지한다.
create table location_private.daily_limits(day date,kind text,count integer not null,primary key(day,kind));
alter table location_private.daily_limits enable row level security;
revoke all on location_private.daily_limits from public,anon,authenticated;
create function location_private.claim_budget(p_kind text,p_limit integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  insert into location_private.daily_limits(day,kind,count) values((now() at time zone 'UTC')::date,p_kind,1)
  on conflict(day,kind) do update set count=location_private.daily_limits.count+1
    where location_private.daily_limits.count<p_limit returning count into v_count;
  if v_count is null then raise exception 'location daily limit reached'; end if;
end $$;
revoke all on function location_private.claim_budget(text,integer) from public,anon,authenticated;

-- 같은 기기 비밀값은 비회원 행에만 사용한다. 로그인하면 auth.uid()가 정본이다.
create function location_private.control(p_action text, p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_subject location_private.subjects%rowtype;
  v_id uuid;
  v_events jsonb;
  v_count bigint := 0;
  v_providers text[];
begin
  if v_uid is null then
    if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then raise exception 'invalid device credential'; end if;
    v_hash := encode(extensions.digest(p_secret,'sha256'),'hex');
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid payload'; end if;
  -- SDK가 대기 중 새 JWT를 택해도 다른 계정의 철회/삭제/열람으로 바뀌지 않는다.
  if not (p_payload ? 'expectedActor') or (p_payload->>'expectedActor') is distinct from v_uid::text then
    raise exception 'authentication context changed';
  end if;
  select * into v_subject from location_private.subjects
    where (v_uid is not null and user_id=v_uid) or (v_uid is null and device_hash=v_hash)
    for update;

  if p_action='consent' then
    if p_payload->>'version' is distinct from '2026-10-11-location-v2'
      or p_payload->'ageConfirmed' is distinct from 'true'::jsonb
      or p_payload->'locationAgreed' is distinct from 'true'::jsonb then raise exception 'explicit consent required'; end if;
    v_providers := array(select jsonb_array_elements_text(coalesce(p_payload->'providers','[]'::jsonb)));
    if cardinality(v_providers)>5 or not v_providers <@ array['kakao','kma','airkorea','opinet','anthropic']::text[] then raise exception 'unsupported provider'; end if;
    v_providers := array(select distinct unnest(v_providers));
    if v_subject.id is null then perform location_private.claim_budget('subjects',1000); end if;
    insert into location_private.subjects(user_id,device_hash,status,version,history_allowed)
      values(v_uid,v_hash,'active','2026-10-11-location-v2',coalesce(v_uid is not null and p_payload->>'historyAgreed'='true',false))
      on conflict do nothing;
    select * into v_subject from location_private.subjects
      where (v_uid is not null and user_id=v_uid) or (v_uid is null and device_hash=v_hash) for update;
    delete from location_private.usage_events where subject_id=v_subject.id
      and recipient not in ('device','motomap','naver') and not (recipient=any(v_providers));
    update location_private.subjects set status='active',version='2026-10-11-location-v2',accepted_at=now(),
      providers=array['naver']::text[] || v_providers,
      history_allowed=coalesce(v_uid is not null and p_payload->>'historyAgreed'='true',false)
      where id=v_subject.id returning * into v_subject;
  elsif p_action not in ('status','events','rides','pause','resume','withdraw','withdraw_history','delete_history','delete_ride','record','complete') then
    raise exception 'unsupported action';
  end if;

  if v_subject.id is null then
    -- 기존 기록 열람·삭제는 새 위치 이용에 동의하지 않아도 허용한다.
    if v_uid is not null and p_action in ('rides','events','withdraw','withdraw_history','delete_history','delete_ride') then
      insert into location_private.subjects(user_id,status,version) values(v_uid,'paused','') on conflict do nothing;
      select * into v_subject from location_private.subjects where user_id=v_uid for update;
    elsif p_action='status' or p_action='events' then
      return jsonb_build_object('events','[]'::jsonb,'status','unknown','version',null,'historyAllowed',false,'providers','[]'::jsonb,'historyCount',
      (select count(*) from public.place_rides where user_id=v_uid)+(select count(*) from public.course_completions where user_id=v_uid));
    else raise exception 'location consent required'; end if;
  end if;

  if p_action in ('pause','resume') then
    if v_subject.status='withdrawn' or v_subject.version<>'2026-10-11-location-v2' then raise exception 'renew consent required'; end if;
    update location_private.subjects set status=case p_action when 'pause' then 'paused' else 'active' end
      where id=v_subject.id returning * into v_subject;
  elsif p_action in ('withdraw','withdraw_history','delete_history') then
    -- 철회/삭제만 개인 방문·완주 기록을 파기한다. 리뷰·즐겨찾기는 건드리지 않는다.
    delete from public.place_rides where user_id=v_uid;
    delete from public.course_completions where user_id=v_uid;
    if p_action='withdraw' then
      delete from location_private.usage_events where subject_id=v_subject.id;
      update location_private.subjects set status='withdrawn',history_allowed=false where id=v_subject.id returning * into v_subject;
    elsif p_action='withdraw_history' then
      delete from location_private.usage_events where subject_id=v_subject.id and purpose='arrival';
      update location_private.subjects set history_allowed=false where id=v_subject.id returning * into v_subject;
    end if;
  elsif p_action='delete_ride' then
    if p_payload->>'kind'='completion' then
      delete from public.course_completions where user_id=v_uid and id=(p_payload->>'id')::uuid;
    elsif p_payload->>'kind'='visit' then
      delete from public.place_rides where user_id=v_uid and id=(p_payload->>'id')::uuid;
    else raise exception 'invalid record kind'; end if;
  elsif p_action='record' then
    if v_subject.status<>'active' or v_subject.version<>'2026-10-11-location-v2' then raise exception 'location processing stopped'; end if;
    if p_payload->>'purpose'='arrival' and not v_subject.history_allowed then raise exception 'history consent required'; end if;
    if p_payload->>'recipient' not in ('device','motomap') and not (p_payload->>'recipient'=any(v_subject.providers)) then raise exception 'provider consent required'; end if;
    if (select count(*) from location_private.usage_events where subject_id=v_subject.id and created_at>now()-interval '1 hour')>=1000 then raise exception 'usage limit reached'; end if;
    v_id := (p_payload->>'id')::uuid;
    if not exists(select 1 from location_private.usage_events where id=v_id) then perform location_private.claim_budget('events',20000); end if;
    insert into location_private.usage_events(id,subject_id,purpose,recipient,outcome)
      values(v_id,v_subject.id,p_payload->>'purpose',p_payload->>'recipient','requested') on conflict do nothing;
    if not exists(select 1 from location_private.usage_events where id=v_id and subject_id=v_subject.id
      and purpose=p_payload->>'purpose' and recipient=p_payload->>'recipient') then raise exception 'event ownership mismatch'; end if;
    return jsonb_build_object('id',v_id,'createdAt',
      (select created_at from location_private.usage_events where id=v_id and subject_id=v_subject.id));
  elsif p_action='complete' then
    if p_payload->>'outcome' not in ('completed','failed') then raise exception 'invalid outcome'; end if;
    update location_private.usage_events set outcome=p_payload->>'outcome'
      where id=(p_payload->>'id')::uuid and subject_id=v_subject.id and outcome='requested';
    return '{}'::jsonb;
  elsif p_action='events' then
    select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into v_events from (
      select id,purpose,recipient,outcome,created_at from location_private.usage_events
      where subject_id=v_subject.id and created_at>=now()-interval '6 months'
        and (p_payload->>'before' is null or (created_at,id)<((p_payload->>'before')::timestamptz,(p_payload->>'beforeId')::uuid))
      order by created_at desc,id desc limit 100
    ) e;
    return jsonb_build_object('events',v_events);
  elsif p_action='rides' then
    select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_events from (
      select * from (
        select pr.id,'visit'::text as kind,coalesce(p.name,pr.name,'이름 없는 장소') as name,pr.created_at,
          pr.role,pr.excluded_from_place_stats,pr.address,pr.latitude,pr.longitude,pr.bike_model
        from public.place_rides pr left join public.places p on p.id=pr.place_id where pr.user_id=v_uid
        union all
        select cc.id,'completion',coalesce(c.name,'코스'),cc.completed_at,'goal',false,null,null,null,cc.bike_model
        from public.course_completions cc left join public.courses c on c.id=cc.course_id where cc.user_id=v_uid
      ) records where p_payload->>'before' is null or (created_at,id)<((p_payload->>'before')::timestamptz,(p_payload->>'beforeId')::uuid)
      order by created_at desc,id desc limit 100
    ) r;
    return jsonb_build_object('rides',v_events);
  end if;

  select (select count(*) from public.place_rides where user_id=v_uid)+(select count(*) from public.course_completions where user_id=v_uid) into v_count;
  return jsonb_build_object('status',v_subject.status,'version',v_subject.version,'historyAllowed',v_subject.history_allowed,
    'providers',to_jsonb(v_subject.providers),
    'acceptedAt',v_subject.accepted_at,'historyCount',v_count);
end $$;
revoke all on function location_private.control(text,text,jsonb) from public;
grant execute on function location_private.control(text,text,jsonb) to anon,authenticated;
create function public.location_privacy(p_action text,p_secret text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select location_private.control(p_action,p_secret,p_payload);
$$;
revoke all on function public.location_privacy(text,text,jsonb) from public;
grant execute on function public.location_privacy(text,text,jsonb) to anon,authenticated;

-- 구버전·직접 INSERT도 새 보유 선택을 우회하지 못한다. 기존 행은 수정/삭제하지 않는다.
create function location_private.check_history_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_subject location_private.subjects%rowtype;
begin
  select * into v_subject from location_private.subjects where user_id=new.user_id for share;
  if v_subject.id is null or v_subject.status<>'active' or v_subject.version<>'2026-10-11-location-v2' or not v_subject.history_allowed then
    raise exception 'history consent required';
  end if;
  return new;
end $$;
revoke all on function location_private.check_history_consent() from public,anon,authenticated;
create trigger place_rides_location_consent before insert on public.place_rides
  for each row execute function location_private.check_history_consent();
create trigger course_completions_location_consent before insert on public.course_completions
  for each row execute function location_private.check_history_consent();

create function location_private.purge_expired_events()
returns void language sql security definer set search_path='' as $$
  delete from location_private.usage_events where created_at<now()-interval '6 months';
  delete from location_private.daily_limits where day<(now() at time zone 'UTC')::date-7;
  delete from location_private.subjects s where user_id is null and accepted_at<now()-interval '6 months'
    and not exists(select 1 from location_private.usage_events e where e.subject_id=s.id);
$$;
revoke all on function location_private.purge_expired_events() from public,anon,authenticated;
grant execute on function location_private.purge_expired_events() to service_role;
-- 기존 운영 스케줄러는 그대로 둔다. 이 보존기간 정리 작업만 승인된 적용 시 활성화한다.
select cron.schedule('purge-location-usage-events','0 17 * * *','select location_private.purge_expired_events()');
commit;
