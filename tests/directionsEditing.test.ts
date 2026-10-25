import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

type Element = { type: any; props: Record<string, any> };
const goal = { name: '목적지', latitude: 37.4, longitude: 127.1 };
const via = { name: '경유지', latitude: 37.3, longitude: 127.2 };

// 실제 입력 화면의 선택·삭제·검색 닫기를 실행한다. 라우터/저장소/GPS만 대역이다.
function setup() {
  const values: any[] = [], effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const scheduled: (() => void)[] = [];
  const launches: any[][] = [];
  let cursor = 0, effectCursor = 0, dirty = false;
  let launch: () => Promise<boolean> = async () => true;
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: any) => {
        const value = typeof next === 'function' ? next(values[index]) : next;
        if (!Object.is(value, values[index])) { values[index] = value; dirty = true; }
      }];
    },
    useRef(initial: any) { return react.useState(() => ({ current: initial }))[0]; },
    useCallback(fn: any) { return fn; },
    useEffect(fn: () => void, deps: unknown[]) {
      const index = effectCursor++;
      const previous = effects[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      scheduled.push(() => { previous?.cleanup?.(); effects[index] = { deps }; fn(); });
    },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const module = loadModule<{ default: () => Element }>('app/directions.tsx', {
    '@/components/search/SearchPlaceIcon': { __esModule: true, default: 'SearchPlaceIcon', RoutePointIcon: 'RoutePointIcon' },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', StyleSheet: { create: (x: unknown) => x } },
    'expo-router': { router: { push() {} }, useLocalSearchParams: () => ({}), useFocusEffect() {} },
    'expo-location': {},
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@expo/vector-icons/MaterialCommunityIcons': { __esModule: true, default: 'Icon' },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/ui/CloseIcon': { __esModule: true, default: 'CloseIcon' },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/search/PointSearchModal': { __esModule: true, default: 'PointSearchModal' },
    '@/stores/useLocationPrivacyStore': { withLocationUse() { throw Error('GPS must not run'); } },
    '@/lib/favoriteMatching': { isFavoritePoint: () => false },
    '@/hooks/useFavorites': { useFavoritePlaces: () => ({}) },
    '@/stores/useMyPlacesStore': { useMyPlacesStore: (select: any) => select({ places: {}, load() {}, save() {} }) },
    '@/lib/navigation': {
      useNavLaunching: (select: any) => select({ launching: false }),
      openNavigation: (...args: any[]) => { launches.push(args); return launch(); },
    },
    '@/lib/recentSearches': { recentTargets: () => [], loadRecentSearches: async () => [], addRecentSearch: async () => [], saveRecentSearches() {}, recentKey() {} },
    '@/lib/toast': { toast: { info() {}, error() {} } },
  });
  let tree: Element;
  const render = () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      dirty = false; cursor = effectCursor = 0;
      tree = module.default();
      while (scheduled.length) scheduled.shift()!();
      if (!dirty) return;
    }
    throw Error('입력 화면 상태가 안정되지 않음');
  };
  const nodes = (node: any): Element[] => Array.isArray(node) ? node.flatMap(nodes)
    : node?.props ? [node, ...nodes(node.props.children)] : [];
  const fields = () => nodes(tree).filter((node) => node.type?.name === 'FieldRow');
  const modal = () => nodes(tree).find((node) => node.type === 'PointSearchModal')!;
  const button = () => nodes(tree).find((node) => node.props.accessibilityLabel === '현재 지점으로 경로 보기');
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); };
  const select = async (index: number, point: unknown) => {
    fields()[index].props.onPress(); render(); modal().props.onSelect(point); await flush();
  };
  const add = () => {
    const button = nodes(tree).find((node) => node.type === 'Pressable' &&
      nodes(node.props.children).some((child) => child.type === 'Icon' && child.props.name === 'plus'));
    if (button) button.props.onPress(); else fields().at(-1)!.props.onAdd();
    render();
  };
  render();
  return { render, fields, modal, button, select, add, flush, launches, nodes: () => nodes(tree),
    setLaunch: (next: typeof launch) => { launch = next; } };
}

test('미리보기에서 돌아와도 목적지를 다시 고르지 않고 현재 지점으로 경로를 연다', async () => {
  const f = setup();
  await f.select(1, goal);
  assert.equal(f.launches.length, 1);
  f.render();
  assert.ok(f.button(), '경로 보기 동작이 없어 목적지 재선택이 필요함');
  f.button()!.props.onPress(); await f.flush();
  assert.equal(f.launches.length, 2);
  assert.equal(f.launches.at(-1)![0].name, goal.name);
});

test('채워진 경유지를 삭제하면 남은 지점으로 미리보기를 다시 연다', async () => {
  const f = setup();
  await f.select(1, goal);
  f.add(); await f.select(1, via);
  assert.equal(f.launches.at(-1)![2].length, 1);
  const before = f.launches.length;
  f.fields()[1].props.onRemove(); await f.flush();
  assert.equal(f.launches.length, before + 1);
  assert.equal(f.launches.at(-1)![2].length, 0);
});

test('빈 경유지 삭제는 재진입하지 않고 검색 뒤로 닫기는 기존 출발·도착을 보존한다', async () => {
  const f = setup();
  await f.select(1, goal);
  const before = f.launches.length;
  f.add(); f.fields()[1].props.onRemove(); await f.flush();
  assert.equal(f.launches.length, before);
  f.fields().at(-1)!.props.onPress(); f.render();
  f.modal().props.onClose(); f.render();
  assert.equal(f.modal().props.visible, false);
  assert.equal(f.fields().at(-1)!.props.value, goal.name);
  assert.ok(f.button(), '검색 취소 후에도 미리보기 재진입 수단이 필요함');
  f.button()!.props.onPress(); await f.flush();
  assert.equal(f.launches.length, before + 1);
});

test('도착지 없을 때는 경로 보기가 비활성이고 처리 중 중복 탭을 합친다', async () => {
  const f = setup();
  assert.ok(f.button());
  assert.equal(f.button()!.props.disabled, true);
  await f.select(1, goal);
  const before = f.launches.length;
  let resolve!: (value: boolean) => void;
  f.setLaunch(() => new Promise((done) => { resolve = done; }));
  const press = f.button()!.props.onPress;
  press(); press();
  assert.equal(f.launches.length, before + 1);
  f.render(); assert.equal(f.button()!.props.disabled, true);
  resolve(true); await f.flush();
  assert.equal(f.button()!.props.disabled, false);
});


test('미리보기 준비 중 삭제·지점 변경은 잠가 표시 지점과 요청 지점을 일치시킨다', async () => {
  const f = setup();
  await f.select(1, goal); f.add(); await f.select(1, via);
  let resolve!: (value: boolean) => void;
  f.setLaunch(() => new Promise((done) => { resolve = done; }));
  const remove = f.fields()[1].props.onRemove;
  f.button()!.props.onPress();
  remove(); // 같은 렌더의 이전 handler가 호출돼도 요청 중인 경유지를 지우지 않는다.
  f.render();
  assert.equal(f.fields()[1].props.value, via.name);
  assert.equal(f.fields()[1].props.disabled, true);
  f.fields()[0].props.onPress(); f.render();
  assert.equal(f.modal().props.visible, false);
  resolve(true); await f.flush();
  f.setLaunch(async () => true);
  assert.equal(f.fields()[1].props.disabled, false);
  f.fields()[1].props.onRemove(); await f.flush();
  assert.equal(f.launches.at(-1)![2].length, 0);
});


test('경로 요청 중 로딩은 경로 보기 버튼에만 표시하고 순서 반전 아이콘을 유지한다', async () => {
  const f = setup(); await f.select(1, goal);
  let resolve!: (value: boolean) => void;
  f.setLaunch(() => new Promise(done => { resolve = done; }));
  f.button()!.props.onPress(); f.render();
  assert.equal(f.nodes().filter(node => node.type === 'Spinner').length, 1);
  const swap = f.nodes().find(node => node.props.accessibilityLabel === '출발지와 도착지 바꾸기');
  assert.ok(swap, '순서 반전 버튼이 로딩 중 사라짐');
  assert.equal(swap.props.disabled, true);
  resolve(true); await f.flush();
});
