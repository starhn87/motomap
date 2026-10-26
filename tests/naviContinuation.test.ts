import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import * as previewHelpers from '@/lib/guidePreview';

type Element = { type: any; props: any };
const goal = { name: '기존 목적지', latitude: 37.5, longitude: 127.1, placeId: 'original' };
const nextGoal = { name: '새 목적지', latitude: 37.6, longitude: 127.2, placeId: 'new' };

function setup(noGPS = false, edit: 'goal' | 'vias' | null = null, routesLoading = false, previousPriority = 2, enabled = true) {
  let dirty = false, cursor = 0;
  let slots: any[] = [];
  const rootSlots: any[] = [], contentSlots: any[] = [];
  const tasks: (() => void)[] = [];
  const effects: { deps: any[]; cleanup?: () => void }[] = [];
  let ec = 0;
  const react: any = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      const owner = slots; return [owner[i], (v: any) => { const next = typeof v === 'function' ? v(owner[i]) : v; if (!Object.is(next, owner[i])) { owner[i] = next; dirty = true; } }]; },
    useRef(initial: any) { return react.useState(() => ({ current: initial }))[0]; },
    useMemo(fn: any) { return fn(); }, useCallback(fn: any) { return fn; },
    useEffect(fn: any, deps: any[]) { const i = ec++; const previous = effects[i]; if (previous && deps.every((v, n) => Object.is(v, previous.deps[n]))) return;
      tasks.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  react.useLayoutEffect = react.useEffect;
  const calls = { resumed: [] as any[], started: 0, tracked: 0, marker: 0, replace: [] as string[], errors: [] as string[], blocked: false, backed: 0 };
  let selectedPriority = 0;
  const listeners: Record<string, () => void> = {};
  let resolveResume!: (value: any) => void, rejectResume!: (error: Error) => void, finishAudit!: () => void;
  const native = {
    addListener(event: string, fn: any) { listeners[event] = fn; return { remove() { delete listeners[event]; } }; },
    resumeGuide(...args: any[]) { calls.resumed.push(args); return new Promise((resolve, reject) => { resolveResume = resolve; rejectResume = reject; }); },
    startGuide() { calls.started++; return Promise.resolve(); },
  };
  const store: any = { goal, priority: previousPriority, viaPlaces: [], preview: { snapshot: { token: 7, start: noGPS ? null : { latitude: 37.4, longitude: 127 }, goal, vias: [], passedVias: [], priority: previousPriority }, edit, returnPending: false },
    start(g: any, p: any, vias: any) { store.goal = g; store.priority = p; store.viaPlaces = vias; },
    requestGuideReturn(token: number) { if (store.preview?.snapshot.token === token) store.preview.returnPending = true; },
  };
  const useSession = Object.assign((select: any) => select(store), { getState: () => store });
  const router = { replace(path: string) { calls.replace.push(path); }, back() { calls.backed++; }, dismissAll() {} };
  const navigation = { setOptions() {} };
  const jsx = (type: any, props: any) => ({ type, props });
  const chain: any = new Proxy({}, { get: () => () => chain });
  const defaultExport = (value: any) => ({ __esModule: true, default: value });
  const deps: Record<string, any> = {
    '@/lib/guideMenuPolicy': { GUIDE_MENU_ACTIONS_ENABLED: enabled, GUIDE_MENU_UNAVAILABLE_MESSAGE: '안내 종료 후 다시 설정해 주세요.' },
    '@/stores/useMyPlacesStore': { useMyPlacesStore: (select: any) => select({ places: {}, load() {} }) },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: (x: any) => x } },
    'expo-router': { useLocalSearchParams: () => ({ resume: '7' }), useRouter: () => router, useNavigation: () => navigation },
    'expo-router/react-navigation': { useIsFocused: () => true, usePreventRemove(blocked: boolean) { calls.blocked = blocked; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-gesture-handler': { Gesture: { Pan: () => chain } },
    'react-native-reanimated': { runOnJS: (fn: any) => fn, useSharedValue: (value: any) => react.useRef({ value }).current },
    'expo-location': { requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), getCurrentPositionAsync: async () => { throw Error('GPS unavailable'); }, Accuracy: { Balanced: 3 } },
    '@/stores/useLocationPrivacyStore': { providerLocationAllowed: () => true, useLocationPrivacyStore: (s: any) => s({ revision: 0 }),
      async withLocationUse(_purpose: any, _provider: any, work: any) { await work(); await new Promise<void>((resolve) => { finishAudit = resolve; }); } },
    '@/lib/guideSession': { useGuideSession: useSession }, '@/lib/guidePreview': previewHelpers,
    '@/lib/naviParams': { parseNaviParams() { throw Error('continuation must use native snapshot'); } },
    '@/lib/navigation': {}, '@/lib/mapFocus': { hasMapOverlayInStack: () => false },
    '@/stores/useMapStore': { useMapStore: Object.assign((s: any) => s({ userLocation: null, requestMapReset() {} }), { getState: () => ({ userLocation: null, requestMapReset() {} }) }) },
    '@/hooks/useUserLocation': { useUserLocation() {} },
    '@/hooks/useBikeRoutes': { useBikeRoutes: () => ({ priority: selectedPriority, setPriority(value: number) { selectedPriority = value; dirty = true; }, route: routesLoading ? undefined : { distance: 1200 }, alternatives: [], mapRoutes: [], trafficParts: [], loading: routesLoading, courseOnly: false, flatVias: [], effVias: [], resetRoutes() {} }) },
    '@/lib/recentSearches': { loadRecentSearches: async () => [], recentTargets: () => [] },
    '@/lib/guideEvents': { markGuideStarted() { calls.marker++; } },
    '@/lib/kakaoNaviInit': { ensureKakaoNaviReady: async () => {} },
    '@/lib/analytics': { createAnalyticsId: () => 'new', track: { navigationStarted() { calls.tracked++; } } },
    '@/lib/distance': { haversine: () => 0 },
    '@/lib/toast': { toast: { error: (message: string) => calls.errors.push(message) } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/constants/Colors': defaultExport({ light: {} }),
    '@/modules/kakao-navi': { ...defaultExport(native), friendlyRouteError: String, pairsFromFlat: () => [] },
    '@/components/navi/RouteFieldRow': { ...defaultExport('RouteFieldRow'), ROW_H: 48, nearestSlot: () => 0 },
  };
  for (const path of ['@expo/vector-icons/Ionicons', '@expo/vector-icons/MaterialCommunityIcons', '@/components/ui/CloseIcon', '@/components/search/PointSearchModal', '@/components/navi/PreviewMap', '@/components/navi/RouteAlternatives']) deps[path] = defaultExport(path);
  const screen = loadModule<{ default: () => Element }>('app/navi.tsx', deps);
  let tree: Element;
  function render() {
    for (let i = 0; i < 20; i++) {
      dirty = false; ec = cursor = 0; slots = rootSlots;
      const root = screen.default();
      slots = contentSlots; cursor = 0; tree = root.type(root.props);
      while (tasks.length) tasks.shift()!();
      if (!dirty) return;
    }
    throw Error('render loop');
  }
  const nodes = (node: any): Element[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
  const start = () => nodes(tree).find((node) => node.type === 'Pressable' && node.props.disabled !== undefined)!.props.onPress();
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); render(); };
  const selectGoal = () => { const goalField = nodes(tree).filter((n) => n.type === 'RouteFieldRow').at(-1)!; goalField.props.onPress(); render(); nodes(tree).find((n) => n.type === '@/components/search/PointSearchModal')!.props.onSelect(nextGoal); render(); };
  render();
  return { calls, store, start, render, flush, selectGoal, listeners, nodes: () => nodes(tree), cancel: () => nodes(tree).find(n => n.type === '@/components/search/PointSearchModal')!.props.onClose(),
    applied: () => resolveResume({ vias: [], passedVias: [] }),
    failed: () => rejectResume(new Error('no route')), finishAudit: () => finishAudit?.(),
    unmount: () => effects.forEach((effect) => effect?.cleanup?.()) };
}

test('재안내 ack 즉시 목적지를 갱신하고 감사 RPC가 끝나기 전에 복원한다. 새 라이딩 시작을 중복 기록하지 않는다', async () => {
  const f = setup(); f.selectGoal(); f.start(); f.render();
  assert.equal(f.calls.blocked, true);
  assert.equal(f.calls.resumed.length, 1);
  f.applied(); await f.flush();
  assert.equal(f.store.goal.placeId, 'new');
  assert.equal(f.store.preview.returnPending, true);
  assert.deepEqual(f.calls.replace, ['/']);
  assert.equal(f.calls.tracked + f.calls.marker + f.calls.started, 0);
  f.finishAudit(); await f.flush();
});

test('미리보기 뒤로는 기존 안내 복원만 요청하고 라이딩을 다시 시작하지 않는다', () => {
  const f = setup(); f.unmount();
  assert.equal(f.store.preview.returnPending, true);
  assert.equal(f.calls.resumed.length, 0);
  assert.equal(f.store.goal.placeId, 'original');
});

test('경로 변경 실패는 기존 세션을 보존하고 다시 선택할 수 있게 한다', async () => {
  const f = setup(); f.start(); f.render(); f.failed(); await f.flush();
  assert.equal(f.store.goal.placeId, 'original');
  assert.equal(f.store.preview.returnPending, false);
  assert.equal(f.calls.blocked, false);
  assert.equal(f.calls.errors.length, 1);
});

test('위치 철회/종료 뒤 늦은 ack로 세션을 되살리지 않는다', async () => {
  const f = setup(); f.start(); f.store.goal = null; f.store.preview = null; f.applied(); await f.flush();
  assert.equal(f.store.goal, null);
  assert.equal(f.calls.replace.length, 0);
});


test('같은 프레임에 연속 시작해도 native 변경 요청은 한 번만 보낸다', () => {
  const f = setup(); f.start(); f.start();
  assert.equal(f.calls.resumed.length, 1);
});


test('GPS 재확인 실패해도 안내 편집을 닫지 않고 목적지 편집과 위치 재시도를 제공한다', async () => {
  const f = setup(true); await f.flush();
  assert.equal(f.calls.backed, 0);
  f.selectGoal();
  const retry = f.nodes().find(n => n.type === 'Pressable' && n.props.children?.props?.children === '현재 위치 다시 확인');
  assert.ok(retry);
  retry.props.onPress(); f.render(); await f.flush();
  assert.equal(f.calls.backed, 0);
  assert.equal(f.calls.errors.length, 2);
  f.unmount();
});


test('길안내 메뉴에서 바로 연 목적지 검색을 취소하면 기존 안내로 바로 복귀한다', () => {
  const f = setup(false, 'goal');
  f.cancel(); f.render();
  assert.equal(f.store.preview.returnPending, true);
  assert.equal(f.calls.backed, 1);
  assert.equal(f.calls.resumed.length, 0);
  assert.equal(f.store.goal.placeId, 'original');
  f.unmount();
});

test('목적지를 고른 뒤 미리보기에서 다시 연 검색 취소는 편집 초안을 보존한다', () => {
  const f = setup(false, 'goal'); f.selectGoal();
  f.nodes().filter(n => n.type === 'RouteFieldRow').at(-1)!.props.onPress(); f.render();
  f.cancel(); f.render();
  assert.equal(f.calls.backed, 0);
  assert.equal(f.store.preview.returnPending, false);
  f.start();
  assert.equal(f.calls.resumed[0][3], nextGoal.name);
  f.unmount();
});


test('경로 카드가 로딩 중이어도 안내 시작 위에 별도 대기 스피너를 만들지 않는다', () => {
  const f = setup(false, null, true);
  assert.equal(f.nodes().filter(node => node.type === 'Spinner').length, 0);
  f.unmount();
});

for (const edit of [null, 'goal', 'vias'] as const) {
  test(`기존 큰길 안내에서 ${edit ?? '다른 경로'} 미리보기는 추천을 먼저 선택하고 사용자 선택은 유지한다`, () => {
    const f = setup(false, edit, false, 4);
    const options = () => f.nodes().find(n => n.type === '@/components/navi/RouteAlternatives')!;
    assert.equal(options().props.priority, 0);
    options().props.onSelect(1); f.render();
    assert.equal(options().props.priority, 1);
    f.start();
    assert.equal(f.calls.resumed[0][5], 1);
    f.unmount();
  });
}

test('제거된 기능의 기존 미리보기에서도 native 재안내를 호출하지 않는다',()=>{
  const f=setup(false,null,false,2,false); f.start(); f.render();
  assert.equal(f.calls.resumed.length,0); assert.equal(f.calls.started,0);
  assert.equal(f.store.goal.placeId,'original'); assert.equal(f.calls.errors.length,1);
});
