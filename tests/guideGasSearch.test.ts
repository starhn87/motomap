import * as gasCache from '../lib/gasCache';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { haversine } from '../lib/distance';
const center = { latitude: 37.5, longitude: 127, prod: 'B034' };
function setup(fetch: (params: any) => Promise<any[]>) {
  return loadModule<any>('lib/guideGasSearch.ts', {
    '@/lib/gasCache': gasCache,
    '@/lib/api/gasStations': { fetchNearbyGasStationsSnapshot: async (params: any) => ({ stations: await fetch(params), fetchedAt: Date.now(), expiresAt: Date.now()+3600000 }) }, '@/lib/distance': { haversine },
  });
}
function station(id: string, km: number, price = 2000) {
  return { id, price, name: id, latitude: center.latitude + km * 1000 / 6371000 * 180 / Math.PI, longitude: center.longitude };
}
test('5km에서 5곳이면 확장하지 않고 고급 유종을 유지한다', async () => {
  const calls: any[] = [], progress: number[] = [];
  const mod = setup(async params => { calls.push(params); return [1,2,3,4,5].map(n => station(String(n), n / 2)); });
  const result = await mod.searchGuideGasStations(center, { signal: new AbortController().signal, valid: () => true,
    progress: async (radius: number) => { progress.push(radius); } });
  assert.equal(calls.length, 1); assert.equal(calls[0].prod, 'B034'); assert.equal(calls[0].radius, 5000);
  assert.equal(result.stations.length, 5); assert.equal(result.radius, 5000); assert.equal(result.partial, false);
  assert.deepEqual(progress, [5000]);
});
test('5km씩 30km까지 확장하고 중복·0원·범위 밖 결과를 제거한다', async () => {
  const calls: any[] = [], progress: number[] = [];
  const mod = setup(async params => { calls.push(params); return [station('one', 28), station('free', 1, 0), station('outside', 31)]; });
  const result = await mod.searchGuideGasStations(center, { signal: new AbortController().signal, valid: () => true,
    progress: async (radius: number) => { progress.push(radius); } });
  assert.deepEqual(progress, [5000,10000,15000,20000,25000,30000]);
  assert.equal(result.completedRadius, 30000); assert.equal(result.partial, false); assert.equal(result.stations.length, 1);
  assert.equal(result.stations[0].id, 'one'); assert.ok(calls.every(c => c.radius === 5000));
  assert.equal(new Set(calls.map(c => `${c.latitude}:${c.longitude}`)).size, calls.length);
});
test('30km 원 안의 어느 방향도 5km 조회 원으로 덮는다', () => {
  const mod = setup(async () => []), tiles = mod.gasSearchTiles(center, 30000);
  for (let km = 0; km <= 30; km++) for (let angle = 0; angle < 360; angle += 3) {
    const radians = angle * Math.PI / 180;
    const point = { latitude: center.latitude + km * 1000 * Math.cos(radians) / 6371000 * 180 / Math.PI,
      longitude: center.longitude + km * 1000 * Math.sin(radians) / (6371000 * Math.cos(center.latitude * Math.PI / 180)) * 180 / Math.PI };
    assert.ok(tiles.some((tile: any) => haversine(point, tile) < 4500), `missing ${km}/${angle}`);
  }
});
test('실패·타임아웃은 30km에 없음으로 표시하지 않고 부분 조회로 구분한다', async () => {
  const mod = setup(async () => { throw new Error('offline'); });
  const result = await mod.searchGuideGasStations(center, { signal: new AbortController().signal, valid: () => true, progress: async () => {} });
  assert.equal(result.partial, true); assert.equal(result.completedRadius, 0); assert.equal(result.radius, 5000);
  const controller = new AbortController(); controller.abort();
  const timed = await mod.searchGuideGasStations(center, { signal: controller.signal, valid: () => true, progress: async () => {} });
  assert.equal(timed.partial, true); assert.equal(timed.completedRadius, 0);
});
test('동의 철회 이후 확장 조회를 멈춘다', async () => {
  let valid = true, calls = 0;
  const mod = setup(async () => { calls++; valid = false; return []; });
  await assert.rejects(mod.searchGuideGasStations(center, { signal: new AbortController().signal, valid: () => valid, progress: async () => {} }), /location_disabled/);
  assert.equal(calls, 1);
});

test('가격순으로 볼 수 있도록 조회 결과를 거리순 40개로 먼저 자르지 않는다', async () => {
  const mod = setup(async params => {
    assert.equal(params.preciseCenter, true);
    return Array.from({ length: 50 }, (_, i) => station(String(i), (i + 1) / 20, 2000 - i));
  });
  const result = await mod.searchGuideGasStations(center, { signal: new AbortController().signal, valid: () => true, progress: async () => {} });
  assert.equal(result.stations.length, 50);
  assert.equal(Math.min(...result.stations.map((s: any) => s.price)), 1951);
});
