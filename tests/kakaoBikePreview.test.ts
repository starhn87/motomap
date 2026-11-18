import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import type * as Directions from '../lib/api/directions';
import type * as Provider from '../lib/providerErrors';

function setup(response: unknown, status = 200) {
  const calls: string[] = [];
  const requests: RequestInit[] = [];
  const provider = loadModule<typeof Provider>('lib/providerErrors.ts', {});
  const directions = loadModule<typeof Directions>('lib/api/directions.ts', {
    '@/lib/env': { requireEnv: () => 'fixture' },
    '@/lib/providerErrors': provider,
    '@/stores/useLocationPrivacyStore': { async withLocationUse(purpose: string, recipient: string, work: () => Promise<unknown>) {
      calls.push(`${purpose}/${recipient}`);
      return work();
    } },
  }, {
    process: { env: {} },
    fetch: async (_url: string, init: RequestInit) => {
      requests.push(init);
      return new Response(JSON.stringify(response), { status });
    },
  });
  return { directions, provider, calls, requests };
}

test('Android은 이륜차 경로 한 건으로 요약·좌표·교통을 받고 전용도로를 피한다', async () => {
  const f = setup({ routes: [{ result_code: 0, summary: { distance: 1540, duration: 231 }, sections: [{ roads: [
    { vertexes: [127, 37, 127.1, 37.1], traffic_state: 4 },
    { vertexes: [], traffic_state: 1 },
    { vertexes: [127.1, 37.1, 127.2, 37.2], traffic_state: 2 },
  ] }] }] });
  const signal = new AbortController().signal;
  const result = await f.directions.fetchBikePreview([127, 37], [127.2, 37.2], [[127.1, 37.1]], 1, signal);
  assert.deepEqual(f.calls, ['route/kakao']);
  const request = f.requests[0];
  const body = JSON.parse(request.body as string);
  assert.equal(request.signal, signal);
  assert.equal(body.car_type, 7);
  assert.deepEqual(body.avoid, ['motorway']);
  assert.equal(body.priority, 'TIME');
  assert.equal(body.waypoints.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.route)), { distance: 1540, duration: 231, polyline: [127, 37, 127.1, 37.1, 127.2, 37.2] });
  assert.deepEqual(Array.from(result.trafficParts, part => part.state), [4, 2]);
});

test('Android 경로 없음·설정 오류·잘못된 좌표를 성공으로 처리하지 않는다', async () => {
  for (const [payload, status, kind] of [
    [{ routes: [{ result_code: 101 }] }, 200, 'invalid_request'],
    [{}, 403, 'configuration'],
    [{ routes: [{ result_code: 0, sections: [{ roads: [{ vertexes: [127, 999, 128, 38] }] }] }] }, 200, 'invalid_response'],
  ] as const) {
    const f = setup(payload, status);
    await assert.rejects(f.directions.fetchBikePreview([127, 37], [128, 38], [], 0),
      (error: unknown) => error instanceof f.provider.ProviderError && error.kind === kind);
  }
});
