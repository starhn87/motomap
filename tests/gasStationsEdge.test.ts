import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  let handler!: (request: Request) => Promise<Response>, upstream = 0;
  loadModule('supabase/functions/gas-stations/index.ts', {
    'npm:proj4@2.15.0': { __esModule: true, default: (_from: string, _to: string, point: number[]) => point },
  }, {
    Request, Response,
    Deno: { env: { get: () => 'fixture-key' }, serve: (value: typeof handler) => { handler = value; } },
    fetch: async () => { upstream++; return new Response(JSON.stringify({ RESULT: { OIL: [] } })); },
  });
  const request = async (lat: number, lng: number, preciseCenter?: boolean) => {
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ lat, lng, radius: 5000, prod: 'B034', preciseCenter }) }));
    assert.equal(response.status, 200); return response.json();
  };
  return { request, calls: () => upstream };
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
