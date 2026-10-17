import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.PRIVACY_SQL_ENGINE) throw new Error('isolated PGlite required');
const { PGlite } = await import(pathToFileURL(process.env.PRIVACY_SQL_ENGINE).href);
const db = new PGlite();
try {
  // 기존 승인 함수 자체의 회귀는 별도다. 이 fixture는 새 래퍼의 차단·권한·원자성을 검사한다.
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema place_catalog_private;
    revoke all on schema place_catalog_private from public,anon,authenticated;
    create table places(id uuid primary key,name text,operational_status text,deleted_at timestamptz);
    create table place_change_reviews(id uuid primary key,place_id uuid,status text,detected_at timestamptz);
    create table place_change_reports(id uuid primary key,place_id uuid,status text,created_at timestamptz);
    insert into places values('11111111-1111-4111-8111-111111111111','Cafe','operational',null);
  `);
  for (const [kind, idArg] of [['review','p_review_id'],['report','p_report_id']]) {
    const table = kind==='review' ? 'place_change_reviews' : 'place_change_reports';
    await db.exec(`create function public.resolve_place_change_${kind}(${idArg} uuid,p_decision text,p_acted_by text)
      returns table(place_id uuid,place_name text,decision text,applied_changes jsonb)
      language plpgsql security definer set search_path='' as $$
      declare target uuid;
      begin
        select r.place_id into target from public.${table} r where r.id=${idArg} and r.status='pending' for update;
        if target is null then raise exception 'not pending'; end if;
        update public.${table} set status=case when p_decision='dismiss' then 'dismissed' else 'resolved' end where id=${idArg};
        if p_decision='hide_moved' then update public.places set operational_status='moved',deleted_at=now() where id=target; end if;
        return query select target,'Cafe'::text,p_decision,'{}'::jsonb;
      end; $$;`);
  }
  await db.exec(await readFile(new URL('../supabase/migrations/20261017120938_guard_stale_place_change_approvals.sql', import.meta.url),'utf8'));
  const target='11111111-1111-4111-8111-111111111111';
  for (const kind of ['review','report']) {
    const table=kind==='review'?'place_change_reviews':'place_change_reports';
    const id=kind==='review'?'22222222-2222-4222-8222-222222222222':'33333333-3333-4333-8333-333333333333';
    await db.query(`insert into ${table} values($1,$2,'pending',now()-interval '8 days')`,[id,target]);
    await db.exec('set role service_role');
    const decision=kind==='review'?'apply':'hide_moved';
    await assert.rejects(()=>db.query(`select * from resolve_place_change_${kind}($1,$2,'operator')`,[id,decision]),/오래되어/);
    await db.query(`select * from resolve_place_change_${kind}($1,'dismiss','operator')`,[id]);
    await assert.rejects(()=>db.query(`select * from place_catalog_private.resolve_place_change_${kind}($1,'dismiss','operator')`,[id]));
    await db.exec('reset role');
  }
  const fresh='44444444-4444-4444-8444-444444444444';
  await db.query("insert into place_change_reports values($1,$2,'pending',now())",[fresh,target]);
  await db.exec('set role service_role');
  // 후속 담당자를 기록할 수 없으면 기존 승인도 같은 트랜잭션에서 되돌린다.
  await assert.rejects(()=>db.query("select * from resolve_place_change_report($1,'hide_moved','')",[fresh]));
  await db.query("select * from resolve_place_change_report($1,'hide_moved','operator')",[fresh]);
  await assert.rejects(()=>db.query("select * from resolve_place_change_report($1,'hide_moved','operator')",[fresh]));
  await db.exec('reset role');
  const followups=(await db.query('select * from place_catalog_private.move_followups')).rows;
  assert.equal(followups.length,1);assert.equal(followups[0].owner,'operator');assert.equal(followups[0].status,'pending');
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(()=>db.query("select * from resolve_place_change_report($1,'dismiss','operator')",[fresh]));
    await assert.rejects(()=>db.exec('select * from place_catalog_private.move_followups'));
    await db.exec('reset role');
  }
  console.log('approval wrappers: stale rejection/dismissal, private bypass denial, atomic followup, duplicate and client denial passed');
} finally { await db.close(); }
