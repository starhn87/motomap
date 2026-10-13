import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const { setupServiceResumeNotification, isServiceResumeNotification } = loadModule<
  typeof import('../lib/serviceResumeNotification')
>('lib/serviceResumeNotification.ts', {});
const data = { type: 'notice', kind: 'service_resumed', action: 'update_app', url: 'https://attacker.invalid' };
const response = (id: string, payload: unknown = data, actionIdentifier = 'default') => ({
  actionIdentifier, notification: { request: { identifier: id, content: { data: payload } } },
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function fixture(last: ReturnType<typeof response> | null = null) {
  let listener: (r: ReturnType<typeof response>) => void = () => {};
  let stored: string | null = null;
  let opens = 0;
  let removed = false;
  let fail = false;
  const deps = {
    defaultActionIdentifier: 'default',
    getLastResponse: async () => last,
    listen: (callback: typeof listener) => { listener = callback; return { remove: () => { removed = true; } }; },
    getHandledId: async () => stored,
    setHandledId: async (id: string) => { stored = id; },
    openStore: async () => { if (fail) throw new Error('cannot open'); opens++; },
  };
  return { deps, tap: (r: ReturnType<typeof response>) => listener(r),
    count: () => opens, stored: () => stored, removed: () => removed,
    fail: (value: boolean) => { fail = value; } };
}

test('명시적인 재개 공지만 스토어 연결 대상으로 분류한다', () => {
  assert.equal(isServiceResumeNotification(data), true);
  for (const value of [null, {}, { type: 'notice' }, { ...data, action: 'open_url' }, { ...data, type: 'place_approved' }]) {
    assert.equal(isServiceResumeNotification(value), false);
  }
});

test('콜드 탭과 중복 수신은 한 번만 처리하고 다음 앱 시작에는 반복하지 않는다', async () => {
  const f = fixture(response('cold'));
  const cleanup = setupServiceResumeNotification(f.deps);
  f.tap(response('cold'));
  await flush();
  assert.equal(f.count(), 1);
  assert.equal(f.stored(), 'cold');
  cleanup();
  const next = setupServiceResumeNotification(f.deps);
  await flush();
  assert.equal(f.count(), 1);
  next();
});

test('웜 탭은 연결하지만 일반 알림·dismiss·cleanup 후 이벤트는 무시한다', async () => {
  const f = fixture();
  const cleanup = setupServiceResumeNotification(f.deps);
  f.tap(response('normal', { type: 'notice', url: '/notifications' }));
  f.tap(response('dismissed', data, 'dismiss'));
  f.tap(response('warm'));
  await flush();
  assert.equal(f.count(), 1);
  cleanup();
  assert.equal(f.removed(), true);
  f.tap(response('after-cleanup'));
  await flush();
  assert.equal(f.count(), 1);
});

test('열기 실패는 처리 완료로 저장하지 않고 다음 탭에서 재시도한다', async () => {
  const f = fixture();
  f.fail(true);
  const cleanup = setupServiceResumeNotification(f.deps);
  f.tap(response('retry'));
  await flush();
  assert.equal(f.stored(), null);
  f.fail(false);
  f.tap(response('retry'));
  await flush();
  assert.equal(f.count(), 1);
  cleanup();
});

test('콜드 응답 조회가 늦어도 최근 웜 탭과 처리 ID를 역행시키지 않는다', async () => {
  let complete: (value: ReturnType<typeof response>) => void = () => {};
  const pending = new Promise<ReturnType<typeof response>>((resolve) => { complete = resolve; });
  const f = fixture();
  const cleanup = setupServiceResumeNotification({ ...f.deps, getLastResponse: () => pending });
  f.tap(response('new'));
  await flush();
  complete(response('old'));
  await flush();
  assert.equal(f.count(), 1);
  assert.equal(f.stored(), 'new');
  cleanup();
});
