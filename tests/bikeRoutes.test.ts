import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import type * as Provider from '../lib/providerErrors';
import type * as Errors from '../lib/kakaoRouteErrors';
import type { BikeRoute } from '../modules/kakao-navi';
import type { useBikeRoutes } from '../hooks/useBikeRoutes';

const route: BikeRoute = { distance: 1200, duration: 100, polyline: [127, 37, 128, 38] };

// 실제 훅의 effect·상태를 실행한다. 자동화 SDK·서버·계정 데이터는 사용하지 않는다.
function setup(request: (vias: number[]) => Promise<BikeRoute>, course = true) {
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
    react: {
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
      __esModule: true, default: { requestBikeRoute: async (_a: number, _b: number, _c: number, _d: number, vias: number[]) => {
        calls += 1;
        return request(vias);
      } },
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
    timeout: () => { for (const timer of [...timers.values()]) timer(); },
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}

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
