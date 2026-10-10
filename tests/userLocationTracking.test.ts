import assert from 'node:assert/strict';
import test from 'node:test';
import { startUserLocationTracking, type UserLocationSource } from '../lib/userLocationTracking';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((done) => setImmediate(done));
const coords = { latitude: 37, longitude: 127 };

function fixture() {
  const calls: string[] = [];
  const positions: typeof coords[] = [];
  const headings: number[] = [];
  let errors = 0;
  let positionRemoved = 0;
  let headingRemoved = 0;
  let positionCallback: Parameters<UserLocationSource['watchPosition']>[0] = () => {};
  let headingCallback: Parameters<UserLocationSource['watchHeading']>[0] = () => {};
  const positionSub = { remove: () => { positionRemoved += 1; } };
  const headingSub = { remove: () => { headingRemoved += 1; } };
  const source: UserLocationSource = {
    requestPermission: async () => { calls.push('permission'); return { status: 'granted' }; },
    lastKnown: async () => { calls.push('cached'); return { coords }; },
    current: async () => { calls.push('current'); return { coords }; },
    watchPosition: async (callback) => { calls.push('position'); positionCallback = callback; return positionSub; },
    watchHeading: async (callback) => { calls.push('heading'); headingCallback = callback; return headingSub; },
  };
  return {
    source, calls, positions, headings, positionSub, headingSub,
    start: () => startUserLocationTracking(source, (value) => positions.push(value), (value) => headings.push(value), () => { errors += 1; }),
    emit: () => {
      positionCallback({ coords });
      headingCallback({ trueHeading: -1, magHeading: 45 });
    },
    counts: () => ({ errors, positionRemoved, headingRemoved }),
  };
}

test('활성 추적은 유지하고 종료 후 구독과 늦은 콜백을 모두 정리한다', async () => {
  const f = fixture();
  const stop = f.start();
  await flush();
  f.emit();
  assert.equal(f.positions.length, 3);
  assert.deepEqual(f.headings, [45]);
  stop();
  stop();
  f.emit();
  assert.equal(f.positions.length, 3);
  assert.deepEqual(f.headings, [45]);
  assert.deepEqual(f.counts(), { errors: 0, positionRemoved: 1, headingRemoved: 1 });
});

test('권한 응답 대기 중 종료하면 위치·센서를 시작하지 않는다', async () => {
  const f = fixture();
  const permission = deferred<{ status: string }>();
  f.source.requestPermission = () => permission.promise;
  const stop = f.start();
  stop();
  permission.resolve({ status: 'granted' });
  await flush();
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.positions, []);
});

test('현재 위치 대기 중 종료하면 늦은 위치를 반영하거나 센서를 시작하지 않는다', async () => {
  const f = fixture();
  const current = deferred<{ coords: typeof coords }>();
  f.source.current = () => current.promise;
  const stop = f.start();
  await flush();
  stop();
  current.resolve({ coords });
  await flush();
  assert.deepEqual(f.calls, ['permission', 'cached']);
  assert.equal(f.positions.length, 1);
});

test('늦게 만들어진 위치 구독은 즉시 해제하고 방향 구독은 시작하지 않는다', async () => {
  const f = fixture();
  const subscription = deferred<typeof f.positionSub>();
  f.source.watchPosition = () => subscription.promise;
  const stop = f.start();
  await flush();
  stop();
  subscription.resolve(f.positionSub);
  await flush();
  assert.ok(!f.calls.includes('heading'));
  assert.deepEqual(f.counts(), { errors: 0, positionRemoved: 1, headingRemoved: 0 });
});

test('방향 구독 대기 중 종료해도 두 native 구독을 정확히 한 번 해제한다', async () => {
  const f = fixture();
  const subscription = deferred<typeof f.headingSub>();
  f.source.watchHeading = () => subscription.promise;
  const stop = f.start();
  await flush();
  stop();
  subscription.resolve(f.headingSub);
  await flush();
  assert.deepEqual(f.counts(), { errors: 0, positionRemoved: 1, headingRemoved: 1 });
});

test('권한 거절은 조용히 멈추고 권한 조회 실패는 처리된 오류로 알린다', async () => {
  for (const denied of [true, false]) {
    const f = fixture();
    f.source.requestPermission = async () => {
      if (denied) return { status: 'denied' };
      throw new Error('permission unavailable');
    };
    f.start()();
    await flush();
    assert.equal(f.counts().errors, 0);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  f.source.requestPermission = async () => { throw new Error('permission unavailable'); };
  const stop = f.start();
  await flush();
  assert.equal(f.counts().errors, 1);
  stop();
});

test('캐시 조회 실패는 최신 위치 추적을 막지 않는다', async () => {
  const f = fixture();
  f.source.lastKnown = async () => { throw new Error('cache unavailable'); };
  const stop = f.start();
  await flush();
  assert.equal(f.positions.length, 1);
  assert.deepEqual(f.calls, ['permission', 'current', 'position', 'heading']);
  assert.equal(f.counts().errors, 0);
  stop();
});

test('캐시 대기 중 종료와 활성 상태의 권한 거절도 센서를 시작하지 않는다', async () => {
  const cached = deferred<{ coords: typeof coords } | null>();
  const f = fixture();
  f.source.lastKnown = () => cached.promise;
  const stop = f.start();
  await flush();
  stop();
  cached.resolve({ coords });
  await flush();
  assert.deepEqual(f.positions, []);
  assert.ok(!f.calls.includes('current'));

  const denied = fixture();
  denied.source.requestPermission = async () => ({ status: 'denied' });
  const stopDenied = denied.start();
  await flush();
  assert.deepEqual(denied.calls, []);
  assert.equal(denied.counts().errors, 0);
  stopDenied();
});

test('종료된 첫 세션의 늦은 위치가 새 세션으로 새지 않는다', async () => {
  const old = fixture();
  const current = deferred<{ coords: typeof coords }>();
  old.source.current = () => current.promise;
  const stopOld = old.start();
  await flush();
  stopOld();
  const next = fixture();
  const stopNext = next.start();
  current.resolve({ coords });
  await flush();
  assert.equal(old.positions.length, 1);
  assert.equal(next.positions.length, 2);
  assert.ok(!old.calls.includes('position'));
  stopNext();
});
