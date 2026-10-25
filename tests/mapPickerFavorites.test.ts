import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  const values: any[] = [], effects: any[] = [], scheduled: (() => void)[] = [];
  let cursor = 0, effectCursor = 0, dirty = false, tree: any;
  const addresses: { resolve: (address: string) => void }[] = [], picked: any[] = [];
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: any) => {
        const value = typeof next === 'function' ? next(values[index]) : next;
        if (!Object.is(values[index], value)) { values[index] = value; dirty = true; }
      }];
    },
    useRef(initial: any) { return react.useState(() => ({ current: initial }))[0]; },
    useEffect(run: any, deps: any[]) {
      const index = effectCursor++, old = effects[index];
      if (old && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
      scheduled.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
    },
  };
  const jsx = (type: unknown, props: any) => ({ type, props });
  const favorites = { places: [{ id: 'favorite', name: '이름 몰랐던 카페', address: '주소', latitude: 37.5, longitude: 127, category: 'cafe' }], general: [] };
  const mod = loadModule<any>('components/map/MapPickerModal.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ActivityIndicator: 'Spinner', StyleSheet: { create: (v: any) => v, absoluteFill: {} } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@mj-studio/react-native-naver-map': { NaverMapView: 'Map', NaverMapMarkerOverlay: 'Marker' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/constants/Colors': { __esModule: true, default: { light: {} } },
    '@/components/ui/CloseIcon': { __esModule: true, default: 'Close' }, '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/lib/api/kakaoLocal': { coordToAddress: async () => new Promise(resolve => { addresses.push({ resolve }); }) },
    '@/constants/mapStyle': { DEFAULT_CENTER: [127,37], DEFAULT_ZOOM: 15 },
    '@/hooks/useFavorites': { useFavoritePlaces: () => ({ data: favorites }) },
    '@/constants/markerImages': { MARKER_IMAGES_CIRCLE_FAV: { cafe: 'favorite' }, GENERAL_MARKER_CIRCLE_FAV: 'general' },
    '@/assets/images/markers/general.png': 'pin',
  });
  const props = { visible: true, initial: null, allowFavorites: true, onClose() {}, onPick: (point: any) => { picked.push(point); } };
  const render = () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      cursor = effectCursor = 0; dirty = false; tree = mod.default(props);
      while (scheduled.length) scheduled.shift()!();
      if (!dirty) return;
    }
    throw Error('렌더가 안정화되지 않음');
  };
  const all = (type: string, node = tree): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(child => all(type, child)) : [...(node.type === type ? [node] : []), ...all(type, node.props?.children ?? null)];
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); render(); };
  render();
  return { props, render, all, flush, addresses, picked };
}

test('지도에서 즐겨찾기를 선택하면 ID를 보존하고 이전 역지오코딩이 덮지 않는다', async () => {
  const f = setup();
  f.all('Map')[0].props.onTapMap({ latitude: 37, longitude: 127 }); f.render();
  f.all('Marker').find(node => node.props.onTap).props.onTap(); f.render();
  f.addresses[0].resolve('이전 지도 탭 주소'); await f.flush();
  f.all('Pressable').find(node => node.props.accessibilityLabel === '이 위치로 선택').props.onPress();
  assert.equal(f.picked[0].placeId, 'favorite'); assert.equal(f.picked[0].name, '이름 몰랐던 카페');
  assert.equal(f.picked[0].address, '주소');
});
test('지도 정지 후 즐겨찾기 터치 영역을 투영하고 이동 시 오래된 영역을 제거한다', async () => {
  const f = setup(), map = f.all('Map')[0];
  map.props.ref.current = { coordinateToScreen: async () => ({ isValid: true, screenX: 120, screenY: 200 }) };
  map.props.onInitialized(); await f.flush();
  let hit = f.all('Pressable').find(node => node.props.accessibilityLabel?.includes('즐겨찾기 선택'));
  assert.equal(hit.props.style.left, 98); assert.equal(hit.props.style.width, 44);
  map.props.onCameraChanged(); f.render();
  assert.equal(f.all('Pressable').filter(node => node.props.accessibilityLabel?.includes('즐겨찾기 선택')).length, 0);
  f.all('Map')[0].props.onCameraIdle(); await f.flush();
  hit = f.all('Pressable').find(node => node.props.accessibilityLabel?.includes('즐겨찾기 선택'));
  hit.props.onPress(); f.render();
  f.all('Pressable').find(node => node.props.accessibilityLabel === '이 위치로 선택').props.onPress();
  assert.equal(f.picked[0].placeId, 'favorite');
});
