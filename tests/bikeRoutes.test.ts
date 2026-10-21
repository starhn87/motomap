import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { allowedLocationPrivacy } from './helpers/allowedLocationPrivacy';
import type * as Provider from '../lib/providerErrors';
import type * as Errors from '../lib/kakaoRouteErrors';
import type { BikeRoute, RoutePriority } from '../modules/kakao-navi';
import type { useBikeRoutes } from '../hooks/useBikeRoutes';

const route: BikeRoute = { distance: 1200, duration: 100, polyline: [127, 37, 128, 38] };

// 실제 훅의 effect·상태를 실행한다. 자동화 SDK·서버·계정 데이터는 사용하지 않는다.
function setup(request: (vias: number[], priority: RoutePriority) => Promise<BikeRoute>, course = true, allowed = true) {
  const provider = loadModule<typeof Provider>('lib/providerErrors.ts', {});
  const errors = loadModule<typeof Errors>('lib/kakaoRouteErrors.ts', { '@/lib/providerErrors': provider });
  const values: unknown[] = [];
  const effects: { deps?: unknown[]; cleanup?: () => void }[] = [];
  const scheduled: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let stateIndex = 0;
  let effectIndex = 0;
  let calls = 0;
  const module = loadModule<{ useBikeRoutes: typeof useBikeRoutes }>('hooks/useBikeRoutes.ts', {
    '@/stores/useLocationPrivacyStore': { ...allowedLocationPrivacy,providerLocationAllowed: () => allowed },
    react: {
      useMemo: (calculate: () => unknown) => calculate(),
      useState(initial: unknown) {
        const index = stateIndex++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (next: unknown) => {
          values[index] = typeof next === 'function' ? next(values[index]) : next;
        }];
      },
      useEffect(run: () => (() => void) | undefined, deps: unknown[]) {
        const index = effectIndex++;
        const previous = effects[index];
        if (previous?.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
        scheduled.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: run() };
        });
      },
    },
    '@/modules/kakao-navi': {
      __esModule: true, default: { requestBikeRoute: async (_a: number, _b: number, _c: number, _d: number, vias: number[], priority: RoutePriority) => {
        calls += 1;
        return request(vias, priority);
      } },
      ROUTE_PRIORITIES: [{ value: 0, label: '추천' }, { value: 1, label: '시간 우선' }, { value: 2, label: '거리 우선' }, { value: 4, label: '큰길 우선' }],
      ...errors,
      pairsFromFlat: (flat: number[]) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[i * 2], flat[i * 2 + 1]]),
    },
    '@/lib/navigation': { sampleWaypoints: (pairs: number[][], count: number) => pairs.slice(0, count) },
    '@/lib/kakaoNaviInit': { ensureKakaoNaviReady: async () => provider.requireProviderAvailable('kakao-navi') },
    '@/lib/api/directions': { fetchBikeTraffic: async () => [] },
    '@/lib/toast': { toast: { info() {} } },
    '@/lib/analytics': { track: { navigationPreviewed() {}, routeFailed() {} } },
    '@/lib/kakaoRouteErrors': errors,
    '@/lib/providerErrors': provider,
  }, {
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const args: Parameters<typeof useBikeRoutes>[0] = {
    start: [127, 37], startName: null,
    goal: { longitude: 128, latitude: 38, name: '테스트 목적지' },
    userVias: [], courseVias: course ? [127.1, 37.1, 127.2, 37.2] : [], isCourseMode: course,
  };
  const render = () => {
    stateIndex = effectIndex = 0;
    const view = module.useBikeRoutes(args);
    while (scheduled.length) scheduled.shift()!();
    return view;
  };
  const settle = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    return render();
  };
  render();
  return {
    render, settle, calls: () => calls,
    args,
    timeout: () => { for (const timer of [...timers.values()]) timer(); },
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}

test('위치 미사용·공급자 미선택 상태는 SDK 요청과 영구 로딩 대신 설정 안내로 종료한다', async () => {
  const f=setup(async()=>route,false,false);
  const view=await f.settle();
  assert.equal(view.loading,false);
  assert.match(view.routeError ?? '',/위치정보 설정/);
  assert.equal(view.canRetryRoute,false);
  assert.equal(f.calls(),0);
});

test('인증·일시 장애는 경유지 축소/코스 출발지 재요청 없이 오류 상태로 끝난다', async () => {
  for (const code of ['G401', 'G503', 'C103', '20411']) {
    const hook = setup(async () => { throw { code: `E_KNSDK_ROUTE_${code}`, message: 'secret-key' }; });
    const view = await hook.settle();
    assert.equal(hook.calls(), 1);
    assert.equal(view.loading, false);
    assert.equal(view.courseOnly, false);
    assert.ok(view.routeError);
    assert.equal(view.routeError.includes('secret-key'), false);
    assert.equal(view.canRetryRoute, code !== 'G401');
    hook.unmount();
  }
});

test('경유지 단절 20412는 축소 후 성공한 실제 경유지를 유지한다', async () => {
  const hook = setup(async (vias) => {
    if (vias.length > 2) throw { code: 'E_KNSDK_ROUTE_20412' };
    return route;
  });
  const view = await hook.settle();
  assert.equal(hook.calls(), 2);
  assert.equal(view.route?.distance, route.distance);
  assert.equal(view.activeVias?.length, 2);
  assert.equal(view.routeError, null);
  hook.unmount();
});

test('현재 출발지 단절 20410은 기존 코스 출발지 폴백을 유지한다', async () => {
  const hook = setup(async () => { throw { code: 'E_KNSDK_ROUTE_20410' }; });
  const view = await hook.settle();
  assert.equal(view.courseOnly, true);
  assert.equal(view.effStart?.[0], 127.1);
  hook.unmount();
});

test('설정 실패 후 수동 재시도·다른 경로 옵션도 네이티브 재호출을 막는다', async () => {
  const hook = setup(async () => { throw { code: 'E_KNSDK_ROUTE_G401' }; });
  const view = await hook.settle();
  view.retryRoute();
  hook.render();
  await hook.settle();
  view.setPriority(1);
  hook.render();
  const changed = await hook.settle();
  assert.equal(hook.calls(), 1);
  assert.equal(changed.loading, false);
  assert.equal(changed.canRetryRoute, false);
  hook.unmount();
});

test('20초 제한 뒤 도착한 응답은 오류 상태를 덮거나 경유지 요청을 이어가지 않는다', async () => {
  let resolve!: (value: BikeRoute) => void;
  const hook = setup(() => new Promise((done) => { resolve = done; }), false);
  await hook.settle();
  hook.timeout();
  resolve(route);
  const view = await hook.settle();
  assert.equal(view.loading, false);
  assert.match(view.routeError ?? '', /응답이 늦어/);
  assert.equal(view.route, undefined);
  assert.equal(hook.calls(), 1);
  hook.unmount();
});

test('비교 옵션을 순차 확보하고 옵션마다 실제 경유지를 안내 선택과 함께 보존한다', async () => {
  const priorities: RoutePriority[] = [];
  const hook = setup(async (vias, priority) => {
    priorities.push(priority);
    if (priority === 1 && vias.length > 2) throw { code: 'E_KNSDK_ROUTE_20412' };
    return { ...route, duration: 100 + priority };
  });
  let view = hook.render();
  for (let i = 0; i < 8; i++) view = await hook.settle();
  assert.deepEqual(priorities, [0, 1, 1, 2, 4]);
  assert.equal(view.alternatives.filter((option) => option.route).length, 4);
  assert.equal(view.alternatives.find((option) => option.value === 0)?.vias?.length, 4);
  assert.equal(view.alternatives.find((option) => option.value === 1)?.vias?.length, 2);
  view.setPriority(1);
  view = hook.render();
  assert.equal(view.route?.duration, 101);
  assert.equal(view.activeVias?.length, 2);
  view.setPriority(0);
  view = hook.render();
  assert.equal(view.route?.duration, 100);
  assert.equal(view.activeVias?.length, 4);
  assert.equal(hook.calls(), 5);
  hook.unmount();
});

test('비교 요청 실패는 선택 경로를 유지하고 나머지 자동 요청을 멈춘다', async () => {
  const hook = setup(async (_vias, priority) => {
    if (priority !== 0) throw { code: 'E_KNSDK_ROUTE_G503' };
    return route;
  }, false);
  let view = hook.render();
  for (let i = 0; i < 5; i++) view = await hook.settle();
  assert.equal(view.route?.distance, route.distance);
  assert.equal(view.loading, false);
  assert.equal(view.routeError, null);
  assert.ok(view.alternatives.find((option) => option.value === 1)?.error);
  assert.equal(hook.calls(), 2);
  assert.ok(view.alternatives.every((option) => !option.loading), '자동 비교 중단 후 대기 옵션에 스피너를 남기지 않는다');
  hook.unmount();
});

test('순차 조회 중 대기 카드도 로딩을 표시하고 완료한 경로만 지도에 제공한다', async () => {
  let finish!: (value: BikeRoute) => void;
  const h = setup(() => new Promise((resolve) => { finish = resolve; }), false);
  let view = h.render();
  assert.equal(view.alternatives.filter((option) => option.loading).length, 4);
  assert.equal(view.mapRoutes.length, 0);
  await h.settle();
  finish(route);
  view = await h.settle();
  assert.equal(view.alternatives.filter((option) => option.loading).length, 3);
  assert.equal(view.mapRoutes.length, 1);
  assert.equal(view.mapRoutes[0].value, 0);
  h.args.enabled = false;
  view = h.render();
  assert.ok(view.alternatives.every((option) => !option.loading));
  h.unmount();
});

test('지점 변경 즉시 이전 경로를 숨기고 늦게 끝난 비교 응답을 버린다', async () => {
  let resolveComparison!: (value: BikeRoute) => void;
  const hook = setup(async (_vias, priority) => priority === 1
    ? new Promise((resolve) => { resolveComparison = resolve; }) : route, false);
  await hook.settle();
  await hook.settle();
  hook.args.goal = { name: '새 목적지', longitude: 129, latitude: 36 };
  const changed = hook.render();
  assert.equal(changed.route, undefined);
  assert.ok(changed.alternatives.every((option) => !option.route));
  resolveComparison({ ...route, distance: 9999 });
  let view = await hook.settle();
  assert.notEqual(view.alternatives.find((option) => option.value === 1)?.route?.distance, 9999);
  hook.args.enabled = false;
  view = hook.render();
  const calls = hook.calls();
  await hook.settle();
  assert.equal(hook.calls(), calls);
  assert.ok(view.alternatives.every((option) => !option.loading));
  hook.unmount();
});
