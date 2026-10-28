import assert from 'node:assert/strict';
import test from 'node:test';
import { createTmapPoiHandler, type TmapSnapshot, type TmapClaim } from '../supabase/functions/_shared/tmapPoiSearch';
import { TMAP_POI_GROUPS, parseTmapPois, tmapCell } from '../supabase/functions/_shared/tmapPoi';
function setup(options: { authorized?: boolean; claim?: TmapClaim; status?: number; malformed?: boolean; truncated?: boolean } = {}) {
  const claims: unknown[] = [];
  const requests: URL[] = [], saves: TmapSnapshot[] = []; let active = 0, peak = 0;
  const handler = createTmapPoiHandler({ appKey: 'fixture-not-a-key', limit: async () => null, authorize: async () => options.authorized !== false,
    claim: async (...args) => { claims.push(args); return options.claim ?? { state: 'claimed', token: 'lease', fetchedAt: Date.now() }; }, save: async (_lat, _lon, _token, snapshot) => { saves.push(snapshot); },
    fetch: (async (url: URL) => { requests.push(url); active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
      const group = TMAP_POI_GROUPS.find(g => g.categories.join(';') === url.searchParams.get('categories'))!;
      if (options.status === 204) return new Response(null, { status: 204 });
      if (options.status) return new Response('{}', { status: options.status });
      return Response.json(options.malformed ? { error: {} } : { searchPoiInfo: { totalCount: options.truncated ? '500' : '1', pois: { poi: [{ id: group.industry, name: '검사 장소', noorLat: '37.5', noorLon: '127', upperAddrName: '서울' }] } } });
    }) as typeof fetch });
  const req = (body: unknown = { ...tmapCell({ latitude: 37.5, longitude: 127 }), secret: 'a'.repeat(64), actor: null }) => handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify(body) }));
  return { requests, saves, claims, req, get peak() { return peak; } };
}
test('63개 지원 업종을18묶음/동시3개 이내로 조회하고 업종을 붙인다', async () => {
  assert.equal(new Set(TMAP_POI_GROUPS.flatMap(g => [...g.categories])).size, 63);
  const f = setup(), r = await f.req(), result = await r.json();
  assert.equal(r.status, 200); assert.equal(result.pois.length, 18); assert.equal(result.partial, false);
  assert.equal(f.requests.length, 18); assert(f.peak <= 3); assert.equal(f.saves.length, 1);
  assert.equal(result.expiresAt - result.fetchedAt, 23 * 3600_000);
  assert(f.requests.every(u => !u.searchParams.has('appKey') && u.searchParams.get('count') === '100'));
});
test('공용 캐시 적중·동시 조회·일일 한도는 공급자를 호출하지 않는다', async () => {
  for (const claim of [{ state: 'hit', snapshot: { pois: [], fetchedAt: 1, expiresAt: 2, partial: false, coverageComplete: true, sourceCell: {lat:1875,lon:6350} } }, { state: 'busy' }, { state: 'limited' }] as TmapClaim[]) {
    const f = setup({ claim }), r = await f.req(); assert.equal(f.requests.length, 0); assert.equal(r.status, claim.state === 'hit' ? 200 : claim.state === 'busy' ? 503 : 429);
  }
});
test('204 빈 결과는 정상 캐시, 오류는 짧은 부분 캐시로 구분한다', async () => {
  const empty = setup({ status: 204 }), r = await empty.req(); assert.equal((await r.json()).partial, false); assert.equal(empty.saves[0].pois.length, 0);
  for (const options of [{ status: 500 }, { malformed: true }, { status: 429 }]) {
    const f = setup(options), result = await (await f.req()).json(); assert.equal(result.partial, true); assert.equal(result.expiresAt - result.fetchedAt, 60_000);
  }
});
test('동의·본문 검사를 통과하기 전에 공급자·캐시를 조회하지 않는다', async () => {
  const f = setup({ authorized: false }); assert.equal((await f.req()).status, 403); assert.equal(f.requests.length, 0);
  assert.equal((await f.req({ lat: 0, lon: 0 })).status, 400);
  assert.equal((await f.req({ data: 'x'.repeat(2100) })).status, 413);
});
test('파서는 업종이 없는 공급자 원문에서 이름으로 업종을 추정하지 않는다', () => {
  assert.deepEqual(parseTmapPois({ searchPoiInfo: { totalCount: '0' } }, 'shop'), []);
  assert.throws(() => parseTmapPois({ error: {} }, 'shop'));
  assert.throws(() => parseTmapPois({ searchPoiInfo: { totalCount: '1', pois: { poi: [{ id: '1', name: '이름', noorLat: '', noorLon: '127' }] } } }, 'shop'));
});

test('서버 조회에 격자와 정수 반경만 보내고 인접 캐시 원본을 그대로 반환한다',async()=>{
  const sourceCell={lat:1875,lon:6350};
  const f=setup({claim:{state:'hit',snapshot:{pois:[],fetchedAt:1,expiresAt:2,partial:false,coverageComplete:true,sourceCell}}});
  const r=await f.req({lat:1875,lon:6351,coverageKm:2,secret:'a'.repeat(64),actor:null});
  assert.deepEqual(f.claims,[[1875,6351,2]]);assert.deepEqual((await r.json()).sourceCell,sourceCell);assert.equal(f.requests.length,0);
  for(const coverageKm of [0,6,1.5,'2'])assert.equal((await f.req({lat:1875,lon:6351,coverageKm,secret:'a'.repeat(64),actor:null})).status,400);
});

test('정상 첫 페이지가 잘렸으면23시간 캐시를 유지해도 인접 재사용 완전성은 false다',async()=>{
  const f=setup({truncated:true}),result=await(await f.req()).json();
  assert.equal(result.partial,false);assert.equal(result.coverageComplete,false);assert.equal(result.expiresAt-result.fetchedAt,23*3600_000);
  const complete=setup(),body=await(await complete.req()).json();assert.equal(body.coverageComplete,true);
});
