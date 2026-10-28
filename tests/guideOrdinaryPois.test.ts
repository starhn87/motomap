import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { insidePoiBounds, validPoiBounds, mergeGuidePois } from '../lib/guidePoiCatalog';
import * as tmap from '../supabase/functions/_shared/tmapPoi';
import * as errors from '../lib/providerErrors';
const bounds = { south: 37.499, west: 126.999, north: 37.501, east: 127.001 };
function setup(options: { allowed?: boolean; bad?: boolean; error?: boolean; expiry?: number } = {}) {
  const requests: any[] = [], recipients: string[] = [];
  const state = { revision: 1, actor: 'actor', secret: 'a'.repeat(64) };
  const api = loadModule<typeof import('../lib/api/guideOrdinaryPois')>('lib/api/guideOrdinaryPois.ts', {
    '@/stores/useLocationPrivacyStore': { providerLocationAllowed: () => options.allowed !== false, useLocationPrivacyStore: { getState: () => state },
      withCoordinateUse: async (_p: any, _purpose: any, recipient: string, work: any) => { recipients.push(recipient); return work(); } },
    '@/lib/providerErrors': errors, '@/lib/guidePoiCatalog': { insidePoiBounds, validPoiBounds, mergeGuidePois }, '../../supabase/functions/_shared/tmapPoi': tmap,
    '@/lib/supabase': { supabase: { functions: { invoke: async (name: string, options2: any) => {
      requests.push({ name, ...options2 });
      if (options.error) return { error: { context: new Response(JSON.stringify({ kind: 'rate_limited' }), { status: 429 }) } };
      return { data: { fetchedAt: Date.now() - 1000, expiresAt: options.expiry ?? Date.now() + tmap.TMAP_SERVER_TTL - 1000, partial: false,
        pois: [{ id: '1', name: '일반 장소', address: '도로명', latitude: options.bad ? NaN : 37.5, longitude: 127, industry: 'pharmacy' }] } };
    } } } },
  }, { AbortController, Response });
  return { api, requests, recipients, state };
}
test('TMAP 프록시만 호출하고 업종·출처를 보존하며 일반 DB 식별자를 만들지 않는다', async () => {
  const f = setup(), result = await f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].name, 'tmap-poi-search');
  assert.equal(f.requests[0].body.lat, 1875); assert.equal(f.requests[0].body.lon, 6350);
  assert.deepEqual(f.recipients, ['tmap']);
  assert.equal(result.pois[0].provider, 'tmap'); assert.equal(result.pois[0].industry, 'pharmacy');
  assert.equal(result.pois[0].placeId, undefined); assert.equal(result.pois[0].category, undefined);
  assert(result.expiresAt <= Date.now() + tmap.TMAP_DEVICE_TTL);
  await f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  assert.equal(f.requests.length, 1, '같은 격자는 기기 메모리 캐시 재사용');
  f.api.clearGuideOrdinaryPoiCache(); await f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  assert.equal(f.requests.length, 2);
});
test('기기 만료는 서버 원본 만료를 넘기거나 재사용 때 연장하지 않는다', async () => {
  const expiry = Date.now() + 5000, f = setup({ expiry });
  const a = await f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  const b = await f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  assert.equal(a.expiresAt, expiry); assert.equal(b.expiresAt, expiry);
});
test('넓은 화면·3D는 투영한 중앙의 격자로 조회하며 보이는 결과만 반환한다', async () => {
  const f = setup(); await f.api.fetchGuideOrdinaryPois({ south: 37.4, west: 126.9, north: 37.6, east: 127.1 }, new AbortController().signal, { latitude: 37.45, longitude: 127.04 });
  assert.equal(f.requests[0].body.lat, Math.floor(37.45 * 50)); assert.equal(f.requests[0].body.lon, Math.floor(127.04 * 50));
});
test('미동의·취소에서는 캐시가 있어도 결과를 내거나 호출하지 않는다', async () => {
  const f = setup({ allowed: false }); await assert.rejects(f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal)); assert.equal(f.requests.length, 0);
  const allowed = setup(); await allowed.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal);
  const c = new AbortController(); c.abort(); await assert.rejects(allowed.api.fetchGuideOrdinaryPois(bounds, c.signal)); assert.equal(allowed.requests.length, 1);
});
test('잘못된 응답·만료·요금 한도 오류를 정상 빈 결과로 삼지 않는다', async () => {
  for (const options of [{ bad: true }, { expiry: Date.now() - 1 }, { error: true }]) {
    const f = setup(options); await assert.rejects(f.api.fetchGuideOrdinaryPois(bounds, new AbortController().signal));
  }
});

test('조회 중 동의 revision이 바뀌면 결과를 버리고 캐시도 남기지 않는다',async()=>{
  const f=setup(),pending=f.api.fetchGuideOrdinaryPois(bounds,new AbortController().signal);
  f.state.revision++;
  await assert.rejects(pending);
  await f.api.fetchGuideOrdinaryPois(bounds,new AbortController().signal);
  assert.equal(f.requests.length,2);
});
test('동일 숫자 ID의 카카오 등록 장소와 TMAP 장소를 같은 장소로 병합하지 않는다',()=>{
  const rows=mergeGuidePois([
    {key:'place:registered',placeId:'registered',providerId:'1',name:'카카오 장소',latitude:37.5,longitude:127},
    {key:'tmap:1',provider:'tmap',providerId:'1',industry:'pharmacy',name:'티맵 장소',latitude:37.5,longitude:127},
  ],bounds);
  assert.equal(rows.length,2);assert.equal(rows[1].placeId,undefined);
});
