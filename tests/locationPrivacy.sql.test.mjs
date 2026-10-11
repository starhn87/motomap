import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// 임시 설치한 PGlite 엔진만 사용한다. Supabase/운영 환경·.env를 읽지 않는다.
if (!process.env.PRIVACY_SQL_ENGINE) throw new Error('PRIVACY_SQL_ENGINE에 임시 PGlite 0.5.8 엔진 경로를 지정해 주세요.');
const { PGlite } = await import(pathToFileURL(process.env.PRIVACY_SQL_ENGINE).href);
const db = new PGlite();
const uidA='11111111-1111-4111-8111-111111111111';
const uidB='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
let checks=0;
async function query(sql) { return (await db.query(sql)).rows; }
async function fails(sql) { await assert.rejects(() => db.exec(sql)); checks++; }
async function call(action,payload={},secret='a'.repeat(64)) {
  const actor = (await query('select auth.uid()::text actor'))[0].actor;
  payload = { expectedActor: actor, ...payload };
  const rows=await db.query('select public.location_privacy($1,$2,$3::jsonb) as data',[action,secret,JSON.stringify(payload)]);
  return rows.rows[0].data;
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema extensions;
    -- pgcrypto와 같은 SHA256 출력. 확장 바이너리/실제 cron 운영은 이 fixture의 범위 밖이다.
    create function extensions.digest(text,text) returns bytea language sql immutable as $$ select sha256(convert_to($1,'UTF8')) $$;
    create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create table public.profiles(id uuid primary key);
    create table public.places(id uuid primary key,name text);
    create table public.courses(id uuid primary key,name text);
    create table public.place_rides(id uuid primary key,user_id uuid references public.profiles(id) on delete cascade,place_id uuid,
      name text,created_at timestamptz default now(),role text,excluded_from_place_stats boolean default false,
      address text,latitude float8,longitude float8,bike_model text);
    create table public.course_completions(id uuid primary key,user_id uuid references public.profiles(id) on delete cascade,
      course_id uuid,completed_at timestamptz default now(),bike_model text);
    create table public.reviews(id uuid primary key,user_id uuid);
    create table public.favorites(id uuid primary key,user_id uuid);
    insert into public.profiles values('${uidA}'),('${uidB}');
    insert into public.place_rides(id,user_id,name,role) values('${id}','${uidA}','기존 장소','goal');
    insert into public.reviews values('${id}','${uidA}'); insert into public.favorites values('${id}','${uidA}');
  `);
  const migration=await readFile(new URL('../supabase/migrations/20261011131542_add_location_privacy_controls.sql',import.meta.url),'utf8');
  await db.exec(migration);
  assert.equal((await query('select count(*)::int n from public.place_rides'))[0].n,1); checks++;
  await db.exec('set role anon');
  assert.equal((await call('status')).status,'unknown'); checks++;
  await fails("select * from location_private.subjects");
  await fails("select public.location_privacy('consent','bad','{}')");
  await assert.rejects(() => call('consent',{version:'wrong',ageConfirmed:true,locationAgreed:true})); checks++;
  const consent={version:'2026-10-11-location-v2',ageConfirmed:true,locationAgreed:true,historyAgreed:false,providers:['kakao']};
  assert.equal((await call('consent',consent)).status,'active'); checks++;
  const event={id,purpose:'search',recipient:'kakao'};
  await call('record',event);
  await assert.rejects(() => call('record',{id,purpose:'weather',recipient:'kma'})); checks++;
  assert.equal((await call('events')).events.length,1); checks++;
  assert.equal((await call('events',{},'b'.repeat(64)).catch(() => ({events:[]}))).events.length,0); checks++;
  await call('pause'); await assert.rejects(() => call('record',event)); checks++;
  await call('resume'); await call('complete',{id,outcome:'completed'});
  assert.equal((await call('events')).events[0].outcome,'completed'); checks++;
  await call('consent',{...consent,providers:[]});
  assert.equal((await call('events')).events.length,0); checks++;
  await assert.rejects(() => call('record',event)); checks++;
  await call('withdraw'); assert.equal((await call('events')).events.length,0); checks++;
  await assert.rejects(() => call('resume')); checks++;

  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uidA}',false); set role authenticated;`);
  assert.equal((await call('status')).historyCount,1); checks++;
  assert.equal((await call('rides')).rides[0].id,id); checks++;
  await assert.rejects(() => call('delete_history',{ expectedActor: uidB })); checks++;
  assert.equal((await call('status')).historyCount,1); checks++;
  await call('consent',{...consent,historyAgreed:true});
  assert.equal((await call('rides')).rides[0].id,id); checks++;
  await call('pause'); assert.equal((await call('rides')).rides.length,1); checks++;
  await call('resume');
  await db.exec(`reset role; insert into public.place_rides(id,user_id,name,role)
    select gen_random_uuid(),'${uidA}','동일 시각 기록','goal' from generate_series(1,105); set role authenticated;`);
  const first=(await call('rides')).rides;
  const second=(await call('rides',{before:first.at(-1).created_at,beforeId:first.at(-1).id})).rides;
  assert.equal(first.length+second.length,106); checks++;
  await call('delete_ride',{id:first[0].id,kind:'visit'});
  assert.equal((await call('status')).historyCount,105); checks++;
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uidB}',false); set role authenticated;`);
  await call('consent',consent); assert.equal((await call('rides')).rides.length,0); checks++;
  await call('delete_ride',{id,kind:'visit'});
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uidA}',false); set role authenticated;`);
  assert.ok((await call('rides')).rides.some(r=>r.id===id) || (await call('status')).historyCount===105); checks++;
  await call('withdraw_history');
  assert.equal((await call('status')).historyCount,0); checks++;
  await db.exec('reset role');
  await fails(`insert into public.place_rides(id,user_id,name,role) values(gen_random_uuid(),'${uidA}','미동의 기록','goal')`);
  assert.equal((await query('select count(*)::int n from public.reviews'))[0].n,1); checks++;
  assert.equal((await query('select count(*)::int n from public.favorites'))[0].n,1); checks++;
  await db.exec('set role authenticated');
  await call('consent',{...consent,historyAgreed:true});
  await db.exec(`reset role; insert into public.courses values('${id}','기존 코스');
    insert into public.course_completions values('${id}','${uidA}','${id}',now(),'기존 바이크'); set role authenticated;`);
  const completions=(await call('rides')).rides;
  assert.equal(completions[0].kind,'completion'); checks++;
  await call('delete_ride',{id,kind:'completion'});
  assert.equal((await call('status')).historyCount,0); checks++;
  await db.exec(`reset role; insert into location_private.daily_limits values((now() at time zone 'UTC')::date,'subjects',1000)
    on conflict(day,kind) do update set count=1000;
    select set_config('request.jwt.claim.sub','',false); set role anon;`);
  await assert.rejects(() => call('consent',consent,'c'.repeat(64))); checks++;
  await db.exec('reset role');
  await db.exec(`insert into location_private.usage_events(id,subject_id,purpose,recipient,outcome,created_at)
    select gen_random_uuid(),id,'map','device','completed',now()-interval '7 months' from location_private.subjects;
    select location_private.purge_expired_events();`);
  assert.equal((await query("select count(*)::int n from location_private.usage_events where created_at<now()-interval '6 months'"))[0].n,0); checks++;
  console.log(`위치정보 SQL fixture ${checks}개 검사 통과 (운영/실제 cron/pgcrypto 확장 바이너리 미검증)`);
} finally { await db.close(); }
