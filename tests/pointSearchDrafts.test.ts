import assert from 'node:assert/strict';
import test from 'node:test';
import * as favoriteMatching from '../lib/favoriteMatching';
import { loadModule } from './helpers/loadModule';

type Node = { type: unknown; props: Record<string, any> };

// 실제 모달의 입력·effect·요청 취소를 실행한다. 네이티브 UI와 검색 API만 대역이다.
function setup() {
  const values: any[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const scheduled: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  const requests: { query: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
  let stateIndex = 0, effectIndex = 0, timerId = 0, dirty = false;
  const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props });
  const react = {
    useState(initial: any) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: any) => {
        const value = typeof next === 'function' ? next(values[index]) : next;
        if (!Object.is(value, values[index])) { values[index] = value; dirty = true; }
      }];
    },
    useRef(initial: any) { return react.useState(() => ({ current: initial }))[0]; },
    useMemo(fn: () => any) { return fn(); },
    useEffect(run: () => (() => void) | undefined, deps: unknown[]) {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      scheduled.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
    },
  };
  const module = loadModule<{ __esModule: true, default: (props: any) => Node }>('components/search/PointSearchModal.tsx', {
    react,
    '@/components/search/SearchPlaceIcon': { __esModule: true, default: 'SearchPlaceIcon', RoutePointIcon: 'RoutePointIcon' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Modal: 'Modal',
      Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
      Keyboard: { dismiss() {} }, StyleSheet: { create: (value: unknown) => value },
    },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/map/MapPickerModal': { __esModule: true, default: 'MapPickerModal' },
    '@/lib/favoriteMatching': favoriteMatching,
    '@/components/ui/CategoryIcon': { __esModule: true, default: 'CategoryIcon' },
    '@/constants/categories': { CATEGORIES: {} },
    '@/stores/useMyPlacesStore': { useMyPlacesStore: (select: any) => select({ places: {} }) },
    '@/components/ui/DialogHost': { DialogCard: 'DialogCard' },
    '@/lib/myPlaceConfirmation': { createMyPlaceConfirmation() {} },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user: null }) },
    '@/hooks/useFavorites': { useFavoritePlaces: () => ({}) },
    '@/lib/api/externalPlaces': { externalPlaceAttribution: () => '', externalPlaceCounts: () => ({}), externalPlaceSource: () => 'kakao' },
    '@/hooks/useSearchAnchor': { getSearchAnchor: () => ({ near: { latitude: 37, longitude: 127 } }) },
    '@/lib/api/search': { searchUnifiedPlaces: (query: string, _near: unknown, options: { signal: AbortSignal }) =>
      new Promise((resolve) => requests.push({ query, signal: options.signal, resolve })) },
    '@/hooks/useVoiceSearch': { useVoiceSearch: () => ({ listening: false, toggle() {}, stop() {} }) },
    'posthog-react-native': { PostHogMaskView: 'PostHogMaskView' },
    '@/lib/analytics': { createAnalyticsId: () => 'test-search', track: { searchResultsViewed() {}, searchNoResults() {}, searchResultSelected() {} } },
    '@/lib/api/generalPlaces': { ensureGeneralPlace() {} },
  }, {
    AbortController,
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const selections: any[] = [];
  const props: Record<string, any> = { visible: true, allowCurrent: true, allowSaved: true, draftKey: 'start', onClose() {}, onSelect(point: any) { selections.push(point); } };
  let tree: Node;
  const render = () => {
    for (let attempts = 0; attempts < 20; attempts++) {
      dirty = false; stateIndex = effectIndex = 0;
      tree = module.default(props);
      while (scheduled.length) scheduled.shift()!();
      if (!dirty) return;
    }
    throw Error('모달 상태 갱신이 끝나지 않음');
  };
  const find = (type: string, node: any = tree): Node | undefined => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) { const match = find(type, child); if (match) return match; } return; }
    if (node.type === type) return node;
    return node.props?.children == null ? undefined : find(type, node.props.children);
  };
  const type = (text: string) => { find('TextInput')!.props.onChangeText(text); render(); };
  const flush = async () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    render();
  };
  render();
  return { props, render, find, type, flush, requests, selections };
}

test('출발·도착 초안을 섞지 않고 재진입 시 해당 입력으로 결과를 새로 조회한다', async () => {
  const f = setup();
  f.type('서울역'); await f.flush();
  f.props.visible = false; f.props.draftKey = undefined; f.render();
  assert.equal(f.requests[0].signal.aborted, true);
  f.props.visible = true; f.props.draftKey = 'goal'; f.render();
  assert.equal(f.find('TextInput')!.props.value, '');
  f.type('부산역'); await f.flush();
  f.props.visible = false; f.props.draftKey = undefined; f.render();
  f.props.visible = true; f.props.draftKey = 'start'; f.render();
  assert.equal(f.find('TextInput')!.props.value, '서울역');
  assert.equal(f.find('FlatList')!.props.data.length, 0);
  await f.flush();
  assert.deepEqual(f.requests.map((request) => request.query), ['서울역', '부산역', '서울역']);
  f.requests[0].resolve({ places: [], kakaoOnly: [{ placeName: '이전 응답' }] });
  await f.flush();
  assert.equal(f.find('FlatList')!.props.data.length, 0);
});

test('초안 기능을 쓰지 않는 모달과 집·회사 설정은 닫으면 입력을 지운다', () => {
  for (const saved of [true, false]) {
    const f = setup();
    f.props.allowSaved = saved;
    if (saved) f.props.draftKey = undefined;
    else f.props.confirmSlot = 'home';
    f.render();
    f.type('민감 주소');
    f.props.visible = false; f.render();
    f.props.visible = true; f.render();
    assert.equal(f.find('TextInput')!.props.value, '');
  }
});


test('출발·도착·경유 편집에서 지도 선택은 장소 ID를 보존하고 다시 검색하지 않는다', async () => {
  for (const draftKey of ['start', 'goal', 'via-1']) {
    const f = setup(); f.props.draftKey = draftKey; f.render();
    const point = { name: '즐겨찾기 카페', latitude: 37.5, longitude: 127, placeId: 'favorite-place', address: '주소' };
    f.find('MapPickerModal')!.props.onPick(point); await f.flush();
    assert.equal(f.selections[0].placeId, 'favorite-place');
    assert.equal(f.selections[0].name, '즐겨찾기 카페');
    assert.equal(f.requests.length, 0);
  }
});
