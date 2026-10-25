import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import * as Cache from '../lib/gasCache';

function clock() {
  let now = 1_800_000_000_000;
  class DeviceDate extends Date { static now() { return now; } }
  return { cache: loadModule<typeof Cache>('lib/gasCache.ts', {}, { Date: DeviceDate }), now: () => now, advance: (ms: number) => { now += ms; } };
}
test('서버 50분 된 가격은 시계 차이와 전송 시간을 보정한 나머지 10분만 유지한다', () => {
  const c = clock(), started = c.now(), server = started - 3600000;
  c.advance(2000);
  const meta = c.cache.gasCacheMetadata({ fetchedAt: server - 3000000, expiresAt: server + 600000, serverTime: server }, started, true);
  assert.equal(meta.expiresAt, started + 600000);
  assert.equal(meta.fetchedAt, started - 3000000);
  assert.equal(c.cache.gasQueryStaleTime({ state: { data: meta, dataUpdatedAt: c.now() } }), 598000);
  c.advance(300000);
  assert.equal(c.cache.gasQueryStaleTime({ state: { data: meta, dataUpdatedAt: started + 2000 } }), 598000);
});
test('빈 결과·구 서버·잘못된 메타데이터는 1시간 캐시가 되지 않는다', () => {
  const c = clock(), now = c.now();
  assert.equal(c.cache.gasCacheMetadata({ fetchedAt: now, expiresAt: now + 3600000, serverTime: now }, now, false).expiresAt, now + 300000);
  assert.equal(c.cache.gasCacheMetadata({}, now, true).expiresAt, now + 180000);
  assert.equal(c.cache.gasCacheMetadata({ fetchedAt: NaN, expiresAt: Infinity, serverTime: now }, now, true).expiresAt, now + 180000);
  assert.equal(c.cache.gasCacheMetadata({ fetchedAt: now - 7200000, expiresAt: now - 3600000, serverTime: now }, now, true).expiresAt, now);
});
test('여러 타일은 가장 이른 만료를 따르고 부분 실패는 최대 1분이다', () => {
  const c = clock(), now = c.now();
  const snapshots = [{ fetchedAt: now - 3000000, expiresAt: now + 600000 }, { fetchedAt: now, expiresAt: now + 3600000 }];
  assert.equal(c.cache.mergedGasExpiry(snapshots, true), now + 600000);
  assert.equal(c.cache.mergedGasExpiry(snapshots, true, true), now + 60000);
  assert.equal(c.cache.mergedGasExpiry(snapshots, false), now + 300000);
});
