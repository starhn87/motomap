import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.PRIVACY_SQL_ENGINE) throw new Error('isolated PGlite required');
const { PGlite } = await import(pathToFileURL(process.env.PRIVACY_SQL_ENGINE).href);
const db = new PGlite();
const read = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url),'utf8');
function table(sql,name) {
  const start=sql.indexOf(`create table public.${name} (`);
  if(start<0) throw new Error(`missing table ${name}`);
  return sql.slice(start,sql.indexOf('\n);',start)+4);
}
function fn(sql,name) {
  const pattern=new RegExp(`create (?:or replace )?function public\\.${name}\\(`,'i');
  const start=sql.search(pattern);
  if(start<0) throw new Error(`missing function ${name}`);
  return sql.slice(start,sql.indexOf('$$;',start)+3);
}
const uid='11111111-1111-4111-8111-111111111111';
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    insert into auth.users values('${uid}');
    -- 좌표 엔진은 본 검사의 대상이 아니다. 기존 SQL의 타입/필드 참조만 연결한다.
    create domain public.geography as text;create domain public.geometry as text;
    create function public.st_x(public.geometry) returns float8 language sql as $$select split_part($1::text,',',1)::float8$$;
    create function public.st_y(public.geometry) returns float8 language sql as $$select split_part($1::text,',',2)::float8$$;
    create function public.st_makepoint(float8,float8) returns public.geometry language sql as $$select ($1::text||','||$2::text)::public.geometry$$;
    create function public.st_setsrid(public.geometry,int) returns public.geometry language sql as $$select $1$$;
    create schema net;create function net.http_post(url text,body jsonb,headers jsonb) returns bigint language plpgsql as $$begin raise exception 'network forbidden in fixture';end;$$;
  `);
  const baseline=await read('20260814142438_remote_schema_baseline');
  for(const name of ['places','notifications','push_tokens']) {
    const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`);
    let ddl=baseline.slice(start,baseline.indexOf('\n);',start)+4).replace('"public"."geography"(Point,4326)','public.geography');
    await db.exec(ddl);
  }
  await db.exec(`alter table public.places add primary key(id);alter table public.notifications add primary key(id);
    alter table public.places add column source_provider text,add column source_place_id text;
    create table general_places(provider text,provider_place_id text,promoted_place_id uuid);`);
  const foundation=await read('20260822010014_add_place_curation_foundation');
  await db.exec(foundation.slice(foundation.indexOf('alter table public.places'),foundation.indexOf('create table public.place_curation_evidence')));
  await db.exec(table(foundation,'place_curation_evidence'));await db.exec(table(foundation,'place_curation_actions'));
  const monitor=await read('20260822151044_add_place_change_monitor');
  await db.exec(table(monitor,'place_change_monitor_state'));await db.exec(table(monitor,'place_change_reviews'));
  const review=await read('20260822153636_add_place_change_discord_approval');
  await db.exec("alter table public.place_change_reviews add column proposed_changes jsonb not null default '{}'::jsonb;");
  await db.exec(fn(review,'resolve_place_change_review'));
  const reportDDL=await read('20260825105614_add_place_change_reports');
  await db.exec(table(reportDDL,'place_change_reports'));
  const report=await read('20260825113306_add_place_change_report_approval');
  await db.exec(report.slice(report.indexOf('alter table public.place_change_reports'),report.indexOf('comment on column')));
  await db.exec(fn(report,'resolve_place_change_report'));
  const notification=await read('20260825120542_notify_place_change_report_results');
  await db.exec(notification.slice(notification.indexOf('create unique index'), notification.indexOf('execute function public.notify_place_change_report_result_on_update();') + 'execute function public.notify_place_change_report_result_on_update();'.length));
  await db.exec(await read('20261017120418_add_place_catalog_revision'));
  await db.exec(await read('20261017120938_guard_stale_place_change_approvals'));
  let seq=0;
  async function place() {
    const id=`22222222-2222-4222-8222-${String(++seq).padStart(12,'0')}`;
    await db.query("insert into places(id,name,category,location,address,phone,approved,operational_status,source_provider,source_place_id) values($1,'Cafe','cafe','127,37','old','010',true,'operational','kakao',$2)",[id,`source-${seq}`]);
    return id;
  }
  async function snapshot(id) { return (await db.query("select jsonb_build_object('name',name,'address',address,'phone',phone,'operational_status',operational_status,'latitude',st_y(location::geometry),'longitude',st_x(location::geometry),'source_provider',source_provider,'source_place_id',source_place_id) as s from places where id=$1",[id])).rows[0].s; }
  async function submit(id,reason,age='0 days') {
    return (await db.query("insert into place_change_reports(reporter_id,place_id,reason,reported_place_snapshot,created_at) values($1,$2,$3,$4,now()-$5::interval) returning id",[uid,id,reason,await snapshot(id),age])).rows[0].id;
  }
  async function resolve(id,decision) { await db.exec('set role service_role');try{return await db.query('select * from resolve_place_change_report($1,$2,$3)',[id,decision,'fixture-operator']);}finally{await db.exec('reset role');} }
  const closed=await place();const closedReport=await submit(closed,'permanently_closed');
  await resolve(closedReport,'hide_permanently_closed');
  assert.ok((await db.query('select deleted_at from places where id=$1',[closed])).rows[0].deleted_at);
  assert.equal((await db.query('select count(*)::int n from place_curation_actions where place_id=$1',[closed])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from place_curation_evidence where place_id=$1',[closed])).rows[0].n,1);
  const closedNotice=(await db.query("select data from notifications where data->>'placeChangeReportId'=$1",[closedReport])).rows;
  assert.equal(closedNotice.length,1);assert.equal(closedNotice[0].data.placeId,undefined);
  await assert.rejects(()=>resolve(closedReport,'hide_permanently_closed'));
  assert.equal((await db.query("select count(*)::int n from notifications where data->>'placeChangeReportId'=$1",[closedReport])).rows[0].n,1);
  const temporary=await place();await resolve(await submit(temporary,'temporarily_closed'),'mark_temporarily_closed');
  await resolve(await submit(temporary,'reopened'),'mark_operational');
  assert.equal((await db.query('select operational_status from places where id=$1',[temporary])).rows[0].operational_status,'operational');
  const moved=await place();const moveReport=await submit(moved,'moved');await resolve(moveReport,'hide_moved');
  assert.equal((await db.query('select count(*)::int n from place_catalog_private.move_followups where place_id=$1',[moved])).rows[0].n,1);
  const stale=await place();await assert.rejects(()=>resolveReportStale(), /오래되어/);
  async function resolveReportStale(){await resolve(await submit(stale,'moved','8 days'),'hide_moved');}
  const conflict=await place();const conflictReport=await submit(conflict,'permanently_closed');await db.query("update places set address='operator new' where id=$1",[conflict]);
  await assert.rejects(()=>resolve(conflictReport,'hide_permanently_closed'), /정보가 바뀌어/);
  assert.equal((await db.query('select count(*)::int n from place_curation_actions where place_id=$1',[conflict])).rows[0].n,0);
  const identity=await place();const snap=await snapshot(identity);
  const reviewId=(await db.query("insert into place_change_reviews(place_id,fingerprint,change_types,confidence,source_provider,current_snapshot,observed_snapshot,proposed_changes) values($1,repeat('a',64),array['address_changed'],'high','kakao',$2,'{}',$3) returning id",[identity,snap,{address:'new address',latitude:38,longitude:128}])).rows[0].id;
  await db.exec('set role service_role');await db.query("select * from resolve_place_change_review($1,'apply','fixture-operator')",[reviewId]);await db.exec('reset role');
  const changed=(await db.query('select address,location from places where id=$1',[identity])).rows[0];assert.equal(changed.address,'new address');assert.equal(changed.location,'128,38');
  assert.equal((await db.query('select count(*)::int n from place_curation_actions where place_id=$1',[identity])).rows[0].n,1);
  // 탈퇴 시 report CASCADE 경로가 이전 후속 FK에 막히지 않아야 한다.
  await db.query('delete from auth.users where id=$1',[uid]);
  assert.equal((await db.query('select count(*)::int n from place_change_reports where reporter_id=$1',[uid])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from place_catalog_private.move_followups')).rows[0].n,1);
  console.log('real resolver+audit+notification integration: closure, temporary/reopen, move followup, stale/conflict/duplicate, identity update, account cascade passed (PostGIS engine/network excluded)');
} catch (error) { console.error(error.message, error.where ?? ''); process.exitCode=1; } finally { await db.close(); }
