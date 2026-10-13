import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const { setupServiceResumeNotification, isServiceResumeNotification, isServiceResumeResponse } = loadModule<
  typeof import('../lib/serviceResumeNotification')
>('lib/serviceResumeNotification.ts', {});
const data = { type: 'notice', kind: 'service_resumed', action: 'update_app', url: 'https://attacker.invalid' };
const defaultAction = 'expo.modules.notifications.actions.DEFAULT';
const response = (id: string, payload: unknown = data, actionIdentifier = defaultAction) => ({
  actionIdentifier, notification: { request: { identifier: id, content: { data: payload } } },
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function fixture(last: ReturnType<typeof response> | null = null) {
  let listener: (r: ReturnType<typeof response>) => void = () => {};
  let stored: string | null = null;
  let opens = 0;
  let removed = false;
  let fail = false;
  let pending: unknown = null;
  const deps = {
    defaultActionIdentifier: defaultAction,
    getLastResponse: async () => last,
    listen: (callback: typeof listener) => { listener = callback; return { remove: () => { removed = true; } }; },
    getHandledId: async () => stored,
    setHandledId: async (id: string) => { stored = id; },
    getPendingIntent: async () => pending,
    setPendingIntent: async (intent: unknown) => { pending = intent; },
    clearPendingIntent: async () => { pending = null; },
    waitForActive: async () => true,
    openStore: async () => { if (fail) throw new Error('cannot open'); opens++; },
  };
  return { deps, tap: (r: ReturnType<typeof response>) => listener(r),
    count: () => opens, stored: () => stored, removed: () => removed,
    pending: () => pending,
    setPending: (value: unknown) => { pending = value; },
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
  cleanup.dispose();
  const next = setupServiceResumeNotification(f.deps);
  assert.equal(await next.settleStartup(), 'none');
  assert.equal(f.count(), 1);
  next.dispose();
});

test('응답·저장소·foreground가 멈춰도 시작 판정을 제한 시간 안에 반환한다', async () => {
  const never = new Promise<never>(() => {});
  for (const [override, expected] of [
    [{ getLastResponse: () => never }, 'unavailable'],
    [{ getHandledId: () => never }, 'pending'],
    [{ waitForActive: () => never }, 'pending'],
  ] as const) {
    const f = fixture(response('deadline'));
    const controller = setupServiceResumeNotification({ ...f.deps, ...override, startupDeadlineMs: 10 });
    assert.equal(await controller.settleStartup(), expected);
    assert.equal(f.count(), 0);
    controller.dispose();
  }
});

test('native 응답·pending 조회 실패를 알림 없음으로 취급하지 않는다', async () => {
  for (const override of [
    { getLastResponse: async () => { throw new Error('native unavailable'); } },
    { getPendingIntent: async () => { throw new Error('storage unavailable'); } },
  ]) {
    const f = fixture();
    const controller = setupServiceResumeNotification({ ...f.deps, ...override });
    assert.equal(await controller.settleStartup(), 'unavailable');
    assert.equal(f.count(), 0);
    controller.dispose();
  }
});

test('foreground를 기다리는 옛 재개 알림은 새 일반 알림 탭으로 취소하고 재시작에도 복구하지 않는다', async () => {
  let cancel: (value: boolean) => void = () => {};
  const f = fixture(response('old-resume'));
  const controller = setupServiceResumeNotification({ ...f.deps,
    waitForActive: () => new Promise<boolean>((resolve) => { cancel = resolve; }),
    cancelActiveWait: () => cancel(false),
  });
  await flush();
  assert.equal((f.pending() as { identifier: string }).identifier, 'old-resume');
  f.tap(response('new-normal', { type: 'notice' }));
  assert.equal(await controller.settleStartup(), 'none');
  assert.equal(f.count(), 0);
  assert.equal(f.pending(), null);
  controller.dispose();
  const next = setupServiceResumeNotification({ ...f.deps, getLastResponse: async () => null });
  assert.equal(await next.settleStartup(), 'none');
  assert.equal(f.count(), 0);
  next.dispose();
});

test('시작 판정 중 새 일반 탭의 pending 삭제가 늦으면 완료 전 reload 허용하지 않는다', async () => {
  let cancel: (value: boolean) => void = () => {};
  let clear: () => void = () => {};
  const f = fixture(response('old-resume'));
  const controller = setupServiceResumeNotification({ ...f.deps, startupDeadlineMs: 30,
    waitForActive: () => new Promise<boolean>((resolve) => { cancel = resolve; }),
    cancelActiveWait: () => cancel(false),
    clearPendingIntent: () => new Promise<void>((resolve) => { clear = () => { f.setPending(null); resolve(); }; }),
  });
  const settling = controller.settleStartup();
  await flush();
  f.tap(response('normal', { type: 'notice' }));
  assert.equal(await settling, 'unavailable');
  assert.equal((f.pending() as { identifier: string }).identifier, 'old-resume');
  clear();
  assert.equal(await controller.settleStartup(), 'none');
  assert.equal(f.pending(), null);
  controller.dispose();
});

test('pending 저장 중 새 탭이 오면 이전 탭의 foreground 대기를 뒤늦게 만들지 않는다', async () => {
  let store: () => void = () => {};
  let waits = 0;
  const f = fixture(response('old-resume'));
  const controller = setupServiceResumeNotification({ ...f.deps,
    setPendingIntent: (intent) => new Promise<void>((resolve) => { store = () => { f.setPending(intent); resolve(); }; }),
    waitForActive: async () => { waits++; return true; },
  });
  await flush();
  f.tap(response('normal', { type: 'notice' }));
  store();
  assert.equal(await controller.settleStartup(), 'none');
  assert.equal(waits, 0);
  assert.equal(f.count(), 0);
  assert.equal(f.pending(), null);
  controller.dispose();
});

test('웜 탭은 연결하지만 일반 알림·dismiss·cleanup 후 이벤트는 무시한다', async () => {
  const f = fixture();
  const cleanup = setupServiceResumeNotification(f.deps);
  f.tap(response('normal', { type: 'notice', url: '/notifications' }));
  f.tap(response('dismissed', data, 'dismiss'));
  f.tap(response('warm'));
  await flush();
  assert.equal(f.count(), 1);
  cleanup.dispose();
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
  cleanup.dispose();
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
  cleanup.dispose();
});

test('iOS 원본 push body/data와 JSON body는 처리하되 임의 URL·다른 trigger는 무시한다', async () => {
  for (const payload of [{ body: data }, { data }, { body: JSON.stringify(data) }]) {
    const native = response('native', null) as import('../lib/serviceResumeNotification').ResumeResponse;
    native.notification.request.trigger = { type: 'push', payload };
    assert.equal(isServiceResumeResponse(native), true);
    const f = fixture(native as ReturnType<typeof response>);
    const controller = setupServiceResumeNotification(f.deps);
    assert.equal(await controller.settleStartup(), 'opened');
    assert.equal(f.count(), 1);
    controller.dispose();
  }
  for (const trigger of [{ type: 'calendar', payload: { body: data } },
    { type: 'push', payload: { url: 'https://attacker.invalid' } },
    { type: 'push', payload: { body: '{broken' } }]) {
    const native = response('ignored', null) as import('../lib/serviceResumeNotification').ResumeResponse;
    native.notification.request.trigger = trigger;
    assert.equal(isServiceResumeResponse(native), false);
  }
});

test('active 전환 전에는 탭만 보존하고, native 응답이 사라진 재시작 뒤 복구한다', async () => {
  let activate: (value: boolean) => void = () => {};
  const waiting = new Promise<boolean>((resolve) => { activate = resolve; });
  const f = fixture(response('reload'));
  const first = setupServiceResumeNotification({ ...f.deps, waitForActive: () => waiting });
  await flush();
  assert.equal(f.count(), 0);
  assert.equal((f.pending() as { identifier: string }).identifier, 'reload');
  first.dispose();
  activate(false);
  await first.settleStartup();
  const next = setupServiceResumeNotification({ ...f.deps, getLastResponse: async () => null });
  assert.equal(await next.settleStartup(), 'opened');
  assert.equal(f.count(), 1);
  assert.equal(f.pending(), null);
  assert.equal(f.stored(), 'reload');
  next.dispose();
});

test('연결 실패는 수동 안내와 pending을 남기고 정상 재시작에서 한 번 재시도한다', async () => {
  const f = fixture(response('failed'));
  let failures = 0;
  f.fail(true);
  const first = setupServiceResumeNotification({ ...f.deps, onOpenFailure: () => { failures++; } });
  assert.equal(await first.settleStartup(), 'failed');
  assert.equal(failures, 1);
  assert.equal(f.stored(), null);
  first.dispose();
  f.fail(false);
  const next = setupServiceResumeNotification({ ...f.deps, getLastResponse: async () => null });
  assert.equal(await next.settleStartup(), 'opened');
  assert.equal(f.count(), 1);
  next.dispose();
});

test('만료되거나 과도한 만료 시간을 가진 pending은 일반 실행에서 자동 이동하지 않는다', async () => {
  for (const value of [{ identifier: 'old', expiresAt: Date.now() - 1 },
    { identifier: 'future', expiresAt: Date.now() + 24 * 60 * 60 * 1000 },
    { identifier: '', expiresAt: Date.now() + 1000 }, '{invalid']) {
    const f = fixture();
    f.setPending(value);
    const controller = setupServiceResumeNotification(f.deps);
    assert.equal(await controller.settleStartup(), 'none');
    assert.equal(f.count(), 0);
    controller.dispose();
  }
});

test('같은 native 실패 응답 재조회는 만료를 연장하지 않고 새 명시적인 탭만 재시도한다', async () => {
  const f = fixture(response('expired-native'));
  const expiresAt = Date.now() - 1000;
  f.setPending({ identifier: 'expired-native', expiresAt });
  const controller = setupServiceResumeNotification(f.deps);
  assert.equal(await controller.settleStartup(), 'none');
  assert.equal(f.count(), 0);
  assert.equal((f.pending() as { expiresAt: number }).expiresAt, expiresAt);
  f.tap(response('expired-native'));
  await flush();
  assert.equal(f.count(), 1);
  controller.dispose();
});
