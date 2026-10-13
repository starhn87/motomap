import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const resume = loadModule<typeof import('../lib/serviceResumeNotification')>('lib/serviceResumeNotification.ts', {});
const navigation = loadModule<typeof import('../lib/notificationNavigation')>('lib/notificationNavigation.ts', {
  './serviceResumeNotification': resume,
});
const placeId = '10000000-0000-0000-0000-000000000001';
const defaultAction = 'expo.modules.notifications.actions.DEFAULT';
const approved = { type: 'place_approved', placeId };
const response = (id: string, data: unknown = approved, trigger?: unknown, actionIdentifier = defaultAction) => ({
  actionIdentifier, notification: { request: { identifier: id, content: { data }, trigger } },
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function fixture(initial: ReturnType<typeof response> | null = null, delayInitial = false) {
  let last = initial;
  let completeInitial: (value: typeof last) => void = () => {};
  let reads = 0;
  let cleared = 0;
  let invalidated = 0;
  let responseListener: (value: ReturnType<typeof response>) => void = () => {};
  let receivedListener = () => {};
  let removed = 0;
  let routeFail = false;
  let clock = 1000;
  const routes: unknown[] = [];
  const recordRoute = (route: unknown) => {
    if (routeFail) throw new Error('not ready');
    routes.push(route);
  };
  const mapFocus = loadModule<typeof import('../lib/mapFocus')>('lib/mapFocus.ts', {
    'expo-router': { router: { setParams: (params: unknown) => recordRoute({ pathname: '/', params }), dismissTo: recordRoute } },
    '@/lib/analytics': { track: { placeViewed() {} } },
    '@/lib/mapCamera': { isMainMapFocused: () => true },
    '@/lib/queryClient': {}, '@/lib/queryKeys': {},
  }, { Date: { now: () => clock } });
  const { setupNotificationTapHandling } = loadModule<typeof import('../lib/push')>('lib/push.ts', {
    'expo-notifications': {
      DEFAULT_ACTION_IDENTIFIER: defaultAction,
      setNotificationHandler: () => {},
      getLastNotificationResponseAsync: () => {
        if (delayInitial && reads++ === 0) return new Promise<typeof last>((resolve) => { completeInitial = resolve; });
        return Promise.resolve(last);
      },
      clearLastNotificationResponseAsync: async () => { cleared++; last = null; },
      addNotificationResponseReceivedListener: (cb: typeof responseListener) => {
        responseListener = cb; return { remove: () => { removed++; } };
      },
      addNotificationReceivedListener: (cb: typeof receivedListener) => {
        receivedListener = cb; return { remove: () => { removed++; } };
      },
    },
    '@react-native-async-storage/async-storage': {},
    'expo-constants': {},
    'react-native': { Platform: { OS: 'ios' } },
    'expo-router': { router: { push: recordRoute } },
    '@/lib/supabase': {},
    '@/lib/queryClient': { queryClient: { invalidateQueries: () => { invalidated++; } } },
    '@/lib/auth': {},
    '@/lib/serviceResumeNotification': resume,
    '@/lib/notificationNavigation': navigation,
    '@/lib/mapFocus': mapFocus,
  }, { Date: { now: () => clock } });
  return {
    start: setupNotificationTapHandling, routes, cleared: () => cleared, last: () => last,
    tap: (r: ReturnType<typeof response>) => { last = r; responseListener(r); },
    completeInitial: (r: typeof last) => completeInitial(r),
    receive: () => receivedListener(), removed: () => removed, invalidated: () => invalidated,
    fail: (value: boolean) => { routeFail = value; },
    advance: () => { clock += 2000; },
  };
}

test('콜드 승인 알림은 장소 상세 요청으로 연결하고 성공한 응답만 비운다', async () => {
  const f = fixture(response('cold'));
  const dispose = f.start();
  await flush();
  const [route] = f.routes as { pathname: string; params: { focusPlaceId: string; focusTs: string; kakaoName?: string; generalPlaceId?: string } }[];
  assert.equal(route.pathname, '/');
  assert.equal(route.params.focusPlaceId, placeId);
  assert.ok(route.params.focusTs);
  assert.ok('kakaoName' in route.params);
  assert.equal(route.params.kakaoName, undefined);
  assert.equal(route.params.generalPlaceId, undefined);
  assert.equal(f.routes.length, 1);
  assert.equal(f.cleared(), 1);
  dispose();
  const nextDispose = f.start();
  await flush();
  assert.equal(f.routes.length, 1);
  nextDispose();
});

test('iOS 원본 body/data와 JSON body도 콜드·웜 승인 상세로 연결한다', async () => {
  for (const payload of [{ body: approved }, { data: approved }, { body: JSON.stringify(approved) }]) {
    for (const cold of [false, true]) {
      const native = response('native', null, { type: 'push', payload });
      const f = fixture(cold ? native : null);
      const dispose = f.start();
      if (!cold) f.tap(native);
      await flush();
      assert.equal(f.routes.length, 1);
      assert.equal((f.routes[0] as { params: { focusPlaceId: string } }).params.focusPlaceId, placeId);
      dispose();
    }
  }
});

test('늦은 콜드 조회와 같은 응답의 중복 이벤트가 최신 탭을 덮어쓰지 않는다', async () => {
  const f = fixture(response('old'), true);
  const dispose = f.start();
  const recent = response('new', { ...approved, placeId: '20000000-0000-0000-0000-000000000002' });
  f.tap(recent);
  f.tap(recent);
  f.completeInitial(response('old'));
  await flush();
  assert.equal(f.routes.length, 1);
  assert.equal(f.last(), null);
  assert.equal((f.routes[0] as { params: { focusPlaceId: string } }).params.focusPlaceId, '20000000-0000-0000-0000-000000000002');
  dispose();
});

test('같은 알림을 나중에 다시 누르면 장소 상세를 다시 연다', async () => {
  const f = fixture();
  const dispose = f.start();
  f.tap(response('same-notification'));
  await flush();
  f.advance();
  f.tap(response('same-notification'));
  await flush();
  assert.equal(f.routes.length, 2);
  dispose();
});

test('취소·언마운트·잘못된 장소 ID는 이동하거나 응답을 소비하지 않는다', async () => {
  for (const r of [response('dismiss', approved, undefined, 'dismiss'), response('bad', { ...approved, placeId: '../settings' })]) {
    const f = fixture(r);
    const dispose = f.start();
    await flush();
    assert.equal(f.routes.length, 0);
    assert.equal(f.cleared(), 0);
    dispose();
  }
  const f = fixture(null, true);
  const dispose = f.start();
  dispose();
  f.completeInitial(response('late'));
  f.tap(response('late-event'));
  await flush();
  assert.equal(f.routes.length, 0);
  assert.equal(f.removed(), 2);
});

test('실패한 라우팅은 소비하지 않고 다음 탭에서 재시도한다', async () => {
  const f = fixture();
  const dispose = f.start();
  f.fail(true);
  f.tap(response('retry'));
  await flush();
  assert.equal(f.cleared(), 0);
  f.fail(false);
  f.tap(response('retry'));
  await flush();
  assert.equal(f.routes.length, 1);
  dispose();
});

test('옛 응답 정리 중 더 최신 응답은 비우지 않는다', async () => {
  const f = fixture();
  const dispose = f.start();
  f.tap(response('approved'));
  f.tap(response('newer-dismiss', {}, undefined, 'dismiss'));
  await flush();
  assert.equal(f.cleared(), 0);
  assert.equal(f.last()?.notification.request.identifier, 'newer-dismiss');
  dispose();
});

test('재개 알림은 루트만 처리하고 수신 자체로는 이동하지 않는다', async () => {
  const f = fixture(response('resume', { type: 'notice', kind: 'service_resumed', action: 'update_app' }));
  const dispose = f.start();
  f.receive();
  await flush();
  assert.equal(f.routes.length, 0);
  assert.equal(f.cleared(), 0);
  assert.equal(f.invalidated(), 1);
  dispose();
});

test('공지·반려·리뷰·코스·라이딩 추천의 기존 이동을 유지한다', async () => {
  const f = fixture();
  const dispose = f.start();
  for (const data of [
    { type: 'review_liked', placeId },
    { type: 'place_change_resolved', placeId },
    { type: 'course_approved', courseId: placeId },
    { type: 'riding_guide_published', guideId: placeId },
    { type: 'place_rejected', notificationId: placeId },
    { type: 'notice', url: 'https://attacker.invalid' },
  ]) f.tap(response(String(f.routes.length), data));
  await flush();
  assert.equal(f.routes.length, 6);
  assert.equal(f.routes.at(-1), '/notifications');
  dispose();
});

test('초기 승인 탭은 OTA 시작 판정에서 navigation으로 넘기고 스토어는 열지 않는다', async () => {
  let opens = 0;
  const controller = resume.setupServiceResumeNotification({
    defaultActionIdentifier: defaultAction, getLastResponse: async () => response('approved'),
    listen: () => ({ remove() {} }), getHandledId: async () => null, setHandledId: async () => {},
    getPendingIntent: async () => null, setPendingIntent: async () => {}, clearPendingIntent: async () => {},
    waitForActive: async () => true, openStore: async () => { opens++; },
    hasNavigationTarget: (r) => navigation.getNavigationNotificationData(r) !== null,
  });
  assert.equal(await controller.settleStartup(), 'navigation');
  assert.equal(opens, 0);
  controller.dispose();
});

test('알 수 없는 원문·배열·잘못된 ID·비푸시 trigger에서 상세 요청을 만들지 않는다', () => {
  for (const r of [
    response('unknown', { type: 'unknown', placeId }), response('array', [approved]),
    response('bad', { type: 'place_approved', placeId: '' }),
    response('bad-trigger', null, { type: 'calendar', payload: { body: approved } }),
  ]) assert.equal(navigation.getNavigationNotificationData(r), null);
});
