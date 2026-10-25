import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup(priced = false, invalid = false) {
  let now = 1_800_000_000_000;
  class FixtureDate extends Date { static now() { return now; } }
  let handler!: (request: Request) => Promise<Response>, upstream = 0;
  loadModule('supabase/functions/gas-stations/index.ts', {
    'npm:proj4@2.15.0': { __esModule: true, default: (_from: string, _to: string, point: number[]) => point },
  }, {
    Request, Response, Date: FixtureDate,
    Deno: { env: { get: () => 'fixture-key' }, serve: (value: typeof handler) => { handler = value; } },
    fetch: async () => { upstream++; return new Response(JSON.stringify({ RESULT: { OIL: priced ? [{ UNI_ID: 'one', OS_NM: '주유소', PRICE: invalid ? 'not-a-price' : 1800, DISTANCE: 100, GIS_X_COOR: 127, GIS_Y_COOR: 37.5 }] : [] } })); },
  });
  const request = async (lat: number, lng: number, preciseCenter?: boolean) => {
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ lat, lng, radius: 5000, prod: 'B034', preciseCenter }) }));
    assert.equal(response.status, invalid ? 502 : 200); return response.json();
  };
  return { request, calls: () => upstream, advance: (ms: number) => { now += ms; } };
}

test('안내 정밀 조회는 같은 0.01도 셀의 다른 중심을 합치지 않고 정밀 모드를 확인해 준다', async () => {
  const f = setup();
  assert.equal((await f.request(37.501, 127.001, true)).preciseCenter, true);
  await f.request(37.504, 127.004, true);
  assert.equal(f.calls(), 2);
  await f.request(37.501, 127.001, true);
  assert.equal(f.calls(), 2);
});
test('일반 지도 요청은 기존 캐시를 유지하며 정밀 조회 캐시와 분리한다', async () => {
  const f = setup();
  assert.equal((await f.request(37.501, 127.001)).preciseCenter, undefined);
  await f.request(37.504, 127.004);
  assert.equal(f.calls(), 1);
  await f.request(37.501, 127.001, true);
  assert.equal(f.calls(), 2);
});


test('정상 가격은 원본 조회부터 60분이며 캐시 응답이 만료 시각을 연장하지 않는다', async () => {
  const f = setup(true), first = await f.request(37.5, 127, true);
  assert.equal(first.expiresAt - first.fetchedAt, 60 * 60 * 1000);
  f.advance(50 * 60 * 1000);
  const reused = await f.request(37.5, 127, true);
  assert.equal(f.calls(), 1); assert.equal(reused.expiresAt, first.expiresAt);
  assert.equal(reused.serverTime - first.fetchedAt, 50 * 60 * 1000);
  f.advance(10 * 60 * 1000 + 1); await f.request(37.5, 127, true);
  assert.equal(f.calls(), 2);
});
test('빈 결과는 5분 뒤 재조회한다', async () => {
  const f = setup(), first = await f.request(37.5, 127);
  assert.equal(first.expiresAt - first.fetchedAt, 5 * 60 * 1000);
  f.advance(5 * 60 * 1000 + 1); await f.request(37.5, 127);
  assert.equal(f.calls(), 2);
});

test('잘못된 가격 응답은 정상 1시간 캐시에 저장하지 않는다', async () => {
  const f = setup(true, true);
  await f.request(37.5, 127); await f.request(37.5, 127);
  assert.equal(f.calls(), 2);
});
