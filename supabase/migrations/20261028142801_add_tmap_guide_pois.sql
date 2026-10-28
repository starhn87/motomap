begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- TMAP은 추가 선택 제공자다. 기존 v2 동의를 승격하거나 임의로 추가하지 않는다.
alter table location_private.usage_events drop constraint usage_events_recipient_check;
alter table location_private.usage_events add constraint usage_events_recipient_check
  check(recipient in ('device','motomap','naver','kakao','kma','airkorea','opinet','anthropic','tmap'));
create or replace function location_private.control(p_action text, p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_subject location_private.subjects%rowtype;
  v_id uuid;
  v_events jsonb;
  v_count bigint := 0;
  v_providers text[];
  v_tmap boolean := coalesce(p_payload->'clientCapabilities' @> '["tmap"]'::jsonb,false);
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
    if cardinality(v_providers)>6 or not v_providers <@ array['kakao','kma','airkorea','opinet','anthropic','tmap']::text[]
      or (not v_tmap and 'tmap'=any(v_providers)) then raise exception 'unsupported provider'; end if;
    -- 구버전의 재동의가 표시할 수 없는 새 제공자 선택을 지우지 않는다.
    if not v_tmap and v_subject.status<>'withdrawn' and 'tmap'=any(v_subject.providers) then v_providers:=array_append(v_providers,'tmap'); end if;
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
      update location_private.subjects set status='withdrawn',history_allowed=false,providers=array_remove(providers,'tmap') where id=v_subject.id returning * into v_subject;
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
        and (v_tmap or recipient<>'tmap')
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
    'providers',to_jsonb(array(select p from unnest(v_subject.providers) p where v_tmap or p<>'tmap')),
    'acceptedAt',v_subject.accepted_at,'historyCount',v_count);
end $$;

-- 공개된 장소 정보만 보관한다. 사용자/검색 이력/원 GPS 좌표를 저장하지 않는다.
create table public.tmap_poi_cache (
  cell_lat integer not null check(cell_lat>=1600 and cell_lat<1950),
  cell_lon integer not null check(cell_lon>=6200 and cell_lon<6600),
  snapshot jsonb,
  expires_at timestamptz,
  lease_token uuid,
  lease_at timestamptz,
  primary key(cell_lat,cell_lon)
);
create index tmap_poi_cache_expiry on public.tmap_poi_cache(expires_at);
alter table public.tmap_poi_cache enable row level security;
revoke all on public.tmap_poi_cache from public,anon,authenticated;
grant all on public.tmap_poi_cache to service_role;
create table public.tmap_poi_daily_budget (
  day date primary key,
  calls integer not null check(calls>=0 and calls<=20000)
);
alter table public.tmap_poi_daily_budget enable row level security;
revoke all on public.tmap_poi_daily_budget from public,anon,authenticated;
grant all on public.tmap_poi_daily_budget to service_role;

-- 격자별 lease로 여러 서버/사용자의 동시 미스를 합친다. 호출 전18회를 예약한다.
-- 무료20,000건을 상한으로 하며 실패/중단 예약은 보수적으로 돌려주지 않는다.
create function public.claim_tmap_poi_refresh(p_lat integer,p_lon integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_row public.tmap_poi_cache%rowtype;
  v_token uuid;
  v_count integer;
begin
  if p_lat is null or p_lon is null or p_lat<1600 or p_lat>=1950 or p_lon<6200 or p_lon>=6600 then raise exception 'invalid cell'; end if;
  insert into public.tmap_poi_cache(cell_lat,cell_lon) values(p_lat,p_lon) on conflict do nothing;
  select * into v_row from public.tmap_poi_cache where cell_lat=p_lat and cell_lon=p_lon for update;
  if v_row.expires_at>clock_timestamp() and v_row.snapshot is not null then
    return jsonb_build_object('state','hit','snapshot',v_row.snapshot);
  end if;
  if v_row.lease_at>clock_timestamp()-interval '30 seconds' then return jsonb_build_object('state','busy'); end if;
  insert into public.tmap_poi_daily_budget(day,calls) values((now() at time zone 'Asia/Seoul')::date,18)
    on conflict(day) do update set calls=tmap_poi_daily_budget.calls+18
    where tmap_poi_daily_budget.calls+18<=20000 returning calls into v_count;
  if v_count is null then return jsonb_build_object('state','limited'); end if;
  v_token:=gen_random_uuid();
  update public.tmap_poi_cache set snapshot=null,expires_at=null,lease_token=v_token,lease_at=clock_timestamp()
    where cell_lat=p_lat and cell_lon=p_lon returning * into v_row;
  -- 유효기간이 지난 공급자 데이터와 오래된 빈 lease 행을 함께 청소한다.
  delete from public.tmap_poi_cache c using (
    select cell_lat,cell_lon from public.tmap_poi_cache
    where (expires_at<clock_timestamp() or (expires_at is null and lease_at<clock_timestamp()-interval '1 day'))
      and (lease_at is null or lease_at<clock_timestamp()-interval '30 seconds')
    order by expires_at nulls first limit 100 for update skip locked
  ) expired where c.cell_lat=expired.cell_lat and c.cell_lon=expired.cell_lon;
  delete from public.tmap_poi_daily_budget where day<(now() at time zone 'Asia/Seoul')::date-2;
  return jsonb_build_object('state','claimed','token',v_token,'fetchedAt',floor(extract(epoch from v_row.lease_at)*1000));
end $$;
revoke all on function public.claim_tmap_poi_refresh(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_tmap_poi_refresh(integer,integer) to service_role;

create function public.finish_tmap_poi_refresh(p_lat integer,p_lon integer,p_token uuid,p_snapshot jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.tmap_poi_cache%rowtype; v_expires timestamptz; v_fetched timestamptz;
begin
  select * into v_row from public.tmap_poi_cache where cell_lat=p_lat and cell_lon=p_lon for update;
  if v_row.lease_token is distinct from p_token or p_token is null or v_row.lease_at<clock_timestamp()-interval '30 seconds' then raise exception 'stale lease'; end if;
  if p_snapshot is null or not p_snapshot ?& array['pois','partial','fetchedAt','expiresAt'] or jsonb_typeof(p_snapshot->'pois')<>'array' or jsonb_array_length(p_snapshot->'pois')>1800
    or pg_column_size(p_snapshot)>1048576 or jsonb_typeof(p_snapshot->'partial')<>'boolean'
    or jsonb_typeof(p_snapshot->'fetchedAt')<>'number' or jsonb_typeof(p_snapshot->'expiresAt')<>'number' then raise exception 'invalid snapshot'; end if;
  v_expires:=to_timestamp((p_snapshot->>'expiresAt')::double precision/1000);
  v_fetched:=to_timestamp((p_snapshot->>'fetchedAt')::double precision/1000);
  if v_expires is null or v_fetched is null or abs(extract(epoch from(v_fetched-v_row.lease_at)))>1
    or v_expires<=clock_timestamp() or v_expires>v_row.lease_at+interval '23 hours' then raise exception 'invalid expiry'; end if;
  update public.tmap_poi_cache set snapshot=p_snapshot,expires_at=v_expires,lease_token=null,lease_at=null where cell_lat=p_lat and cell_lon=p_lon;
end $$;
revoke all on function public.finish_tmap_poi_refresh(integer,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_tmap_poi_refresh(integer,integer,uuid,jsonb) to service_role;
commit;
