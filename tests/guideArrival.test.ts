import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { haversine } from '../lib/distance';
function setup() {
  let revision = 1, allowed = true, user: any = { id: 'rider' }, saved = true, uuid = 0;
  let release: (() => void) | undefined, block: Promise<void> | undefined;
  const writes: any[] = [], invalidations: any[] = [];
  const mod = loadModule<any>('lib/guideArrival.ts', {
    'expo-crypto': { randomUUID: () => `row-${++uuid}` },
    '@/lib/api/rides': { recordPlaceRides: async (rows: any, valid: any) => { if (!valid()) return false; writes.push(rows); return saved; } },
    '@/lib/api/courseLibrary': { recordCourseCompletion: async () => true },
    '@/lib/ridePlaceStats': { buildPlaceRidesForArrival: () => [{ role: 'goal', place_id: 'place' }] },
    '@/stores/useMyPlacesStore': { useMyPlacesStore: { getState: () => ({ load: async () => { await block; }, places: {} }) } },
    '@/stores/useAuthStore': { useAuthStore: { getState: () => ({ user }) } },
    '@/stores/useLocationPrivacyStore': { locationUseAllowed: () => allowed,
      useLocationPrivacyStore: { getState: () => ({ revision, historyAllowed: allowed }) } },
    '@/lib/queryClient': { queryClient: { invalidateQueries: (key: any) => { invalidations.push(key.queryKey); } } },
    '@/lib/distance': { haversine }, '@/lib/analytics': { track: { courseCompleted() {} } },
  });
  return { mod, writes, invalidations, fail: () => { saved = false; }, succeed: () => { saved = true; },
    block: () => { block = new Promise<void>(resolve => { release = resolve; }); }, release: () => release?.(),
    revoke: () => { revision++; allowed = false; }, logout: () => { user = null; } };
}
const goal = () => ({ name: '목적지', latitude: 37.5, longitude: 127, placeId: 'place' });
test('안내 유지 중 도착을 저장하고 반복 도착·나중 종료는 한 번만 저장한다', async () => {
  const f = setup(), target = goal();
  await Promise.all([f.mod.recordGuideArrival(target, []), f.mod.recordGuideArrival(target, [])]);
  await f.mod.recordGuideArrival(target, []);
  assert.equal(f.writes.length, 1); assert.equal(f.mod.hasGuideArrived(target), true);
  assert.deepEqual(f.invalidations.map(key => key[0]), ['my-rides','my-ride-stats','place-rides']);
});
test('네트워크 실패 후 재시도는 같은 행 id를 사용한다', async () => {
  const f = setup(), target = goal(); f.fail(); await f.mod.recordGuideArrival(target, []);
  f.succeed(); await f.mod.recordGuideArrival(target, []);
  assert.equal(f.writes.length, 2); assert.equal(f.writes[0][0].id, f.writes[1][0].id);
});
for (const change of ['revoke', 'logout'] as const) test(`도착 저장 대기 중 ${change}면 저장하지 않는다`, async () => {
  const f = setup(); f.block(); const pending = f.mod.recordGuideArrival(goal(), []); f[change](); f.release(); await pending;
  assert.equal(f.writes.length, 0);
});
test('이전 목적지의 늦은 도착과 잘못된 거리는 현재 방문을 기록하지 않는다', () => {
  const f = setup(), target = goal(), event = { ...target, distance: 10 };
  assert.equal(f.mod.matchesGuideArrival(target, event), true);
  for (const change of [{ name: '이전 목적지' }, { latitude: 38 }, { distance: NaN }, { distance: -1 }, { distance: 301 }])
    assert.equal(f.mod.matchesGuideArrival(target, { ...event, ...change }), false);
});

test('같은 목적지로 다른 경로를 적용해 객체가 바뀌어도 같은 방문은 중복 저장하지 않는다', async () => {
  const f = setup(), first = { ...goal(), visitIdentity: {} };
  await f.mod.recordGuideArrival(first, []);
  const continued = { ...first };
  await f.mod.recordGuideArrival(continued, []);
  assert.equal(f.writes.length, 1);
  await f.mod.recordGuideArrival({ ...first, visitIdentity: {} }, []);
  assert.equal(f.writes.length, 2);
});
