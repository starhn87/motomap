import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
function setup() {
  let user = 'rider', revision = 1, guard = true;
  let hold: Promise<void> | undefined, release: (() => void) | undefined;
  const writes: any[] = [];
  const mod = loadModule<any>('lib/api/rides.ts', {
    '@/lib/supabase': { supabase: { from: () => ({
      upsert: async (rows: any, options: any) => { writes.push({ rows, options }); return { error: null }; },
      insert: async (rows: any) => { writes.push({ rows }); return { error: null }; },
    }) } },
    '@/stores/useLocationPrivacyStore': { locationUseAllowed: () => true,
      useLocationPrivacyStore: { getState: () => ({ revision, historyAllowed: true }) }, withLocationUse: async (_p: any, _v: any, work: any) => work() },
    '@/lib/auth': { getCurrentUser: async () => ({ id: user }) },
    '@/lib/nickname': { getProfile: async () => { await hold; return null; } },
    '@/constants/bikes': { BIKE_SPECS: {}, canonicalBikeModel: () => null },
    '@/lib/ridePlaceStats': {},
  });
  return { mod, writes, valid: () => guard,
    block: () => { hold = new Promise<void>(resolve => { release = resolve; }); }, release: () => release?.(),
    revoke: () => { revision++; }, switchUser: () => { user = 'other'; }, cancel: () => { guard = false; } };
}
const rows = [{ id: '00000000-0000-4000-8000-000000000001', place_id: 'place', role: 'goal' }];
test('도착 저장은 기존 id PK에 중복 무시 INSERT를 사용한다', async () => {
  const f = setup(); assert.equal(await f.mod.recordPlaceRides(rows, f.valid), true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.writes[0].options)), { onConflict: 'id', ignoreDuplicates: true });
  assert.equal(f.writes[0].rows[0].user_id, 'rider');
});
for (const action of ['revoke', 'switchUser', 'cancel'] as const) test(`프로필 조회 대기 중 ${action}면 방문 쓰기를 중단한다`, async () => {
  const f = setup(); f.block(); const pending = f.mod.recordPlaceRides(rows, f.valid);
  await Promise.resolve(); await Promise.resolve(); f[action](); f.release();
  assert.equal(await pending, false); assert.equal(f.writes.length, 0);
});
