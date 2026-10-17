import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.PRIVACY_SQL_ENGINE) throw new Error('PRIVACY_SQL_ENGINE must point to isolated PGlite');
const { PGlite } = await import(pathToFileURL(process.env.PRIVACY_SQL_ENGINE).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.places(id int primary key, name text, approved boolean,
      deleted_at timestamptz, operational_status text, address text,
      last_verified_at timestamptz, next_verification_at timestamptz, source_provider text, source_place_id text);
    create table general_places(provider text,provider_place_id text,promoted_place_id int);
    insert into public.places values(1,'Cafe',true,null,'open','old',null,null,'kakao','123');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261017120418_add_place_catalog_revision.sql', import.meta.url),'utf8'));
  async function revision() { return (await db.query('select public.get_place_catalog_revision() as r')).rows[0].r; }
  assert.equal(await revision(),'1');
  await db.exec("update places set last_verified_at=now(), next_verification_at=now()");
  assert.equal(await revision(),'1');
  await db.exec("update places set name=name"); assert.equal(await revision(),'1');
  await db.exec("update places set deleted_at=now(), operational_status='permanently_closed'");
  assert.equal(await revision(),'2');
  assert.deepEqual((await db.query('select get_place_catalog_suppressions() as s')).rows[0].s,[{provider:'kakao',providerId:'123'}]);
  await db.exec("begin; update places set address='new'; rollback;"); assert.equal(await revision(),'2');
  await db.exec("update places set address='new', deleted_at=null, operational_status='open'");
  assert.equal(await revision(),'3');
  await db.exec("insert into places(id,name,approved) values(2,'pending',false)");
  assert.equal(await revision(),'3');
  await db.exec("update places set approved=true where id=2"); assert.equal(await revision(),'4');
  // 등록 row에 ID가 없어도 검증된 canonical 연결의 재개는 다시 노출한다.
  await db.exec("insert into general_places values('kakao','linked',1)");
  await db.exec("update places set source_provider=null,source_place_id=null,deleted_at=now(),operational_status='moved' where id=1");
  assert.equal((await db.query("select get_place_catalog_suppressions() @> '[{\"provider\":\"kakao\",\"providerId\":\"linked\"}]'::jsonb as yes")).rows[0].yes,true);
  await db.exec("update places set deleted_at=null,operational_status='operational' where id=1");
  assert.equal((await db.query("select get_place_catalog_suppressions() @> '[{\"provider\":\"kakao\",\"providerId\":\"linked\"}]'::jsonb as yes")).rows[0].yes,false);
  const expectedRevision=await revision();
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec(`set role ${role}`); assert.equal(await revision(),expectedRevision);
    await assert.rejects(()=>db.exec('update place_catalog_private.revision set revision=0'));
    await assert.rejects(()=>db.exec('select * from place_catalog_private.revision'));
    await db.exec('reset role');
  }
  console.log('place catalog SQL: revisions, rollback, no-op, metadata, publication, role grants passed');
} finally { await db.close(); }
