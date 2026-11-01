import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup(overrides: Record<string, unknown> = {}) {
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
    useMemo(run: any, deps: any[]) {
      const slot = react.useState(() => ({ deps: null as any[] | null, value: undefined as any }))[0];
      if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps![i]))) { slot.deps = deps; slot.value = run(); }
      return slot.value;
    },
    useEffect(run: any, deps: any[]) {
      const index = effectCursor++, old = effects[index];
      if (old && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
      scheduled.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
    },
  };
  const jsx = (type: unknown, props: any) => ({ type, props });
  const favorites = {
    places: [{ id: 'favorite', name: '이름 몰랐던 카페', address: '주소', latitude: 37.5, longitude: 127, category: 'cafe' }],
    general: [{ id: 'fav-general', name: '바닷가 풀빌라', address: '바닷가 주소', latitude: 37.52, longitude: 127.02, generalPlaceId: 'general-saved' }],
  };
  // 등록 장소 조회 결과 — 즐겨찾기와 같은 장소는 별 마커만 남아야 한다.
  const registered = [favorites.places[0], { id: 'repair', name: '바이크 정비소', address: '정비소 주소', latitude: 37.5005, longitude: 127.0005, category: 'repair_shop' }];
  const placeQueries: any[] = [];
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
    '@/constants/markerImages': { MARKER_IMAGES: { cafe: 'cafe-pin', repair_shop: 'repair-pin' }, MARKER_IMAGES_FAV: { cafe: 'favorite-pin' }, GENERAL_MARKER_FAV: 'general-favorite-pin' },
    '@/lib/api/favorites': { findGeneralFavorite: (list: any[], place: any) => list.find(item => item.name === place.name) },
    '@/components/map/FavoritePlaceMarkers': { __esModule: true, default: 'Favorites' },
    '@/components/map/TempPlaceMarker': { __esModule: true, default: 'TempMarker' },
    '@/assets/images/markers/general.png': 'pin',
    '@/hooks/usePlaces': { usePlaces: (_c: any, center: any, enabled: boolean) => { placeQueries.push({ center, enabled }); return { data: enabled ? registered : undefined }; }, isInMapRenderWindow: () => true },
    '@/hooks/usePlaceOperationalStatus': { usePlaceOperationalStatuses: () => ({ data: {} }) },
    '@/components/map/RegisteredPlaceMarkers': { __esModule: true, default: 'Registered', PLACE_MARKER_GLOBAL_Z_INDEX: 1, TEMPORARILY_CLOSED_MARKER_ALPHA: 0.5, markerCaption: (name: string) => name },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' },
    '@/components/map/PlaceBottomSheet': { __esModule: true, default: 'PlaceSheet' },
    '@/components/map/TempPlaceSheet': { __esModule: true, default: 'TempSheet' },
    '@/lib/symbolPlace': { resolveSymbolPlace: async () => (prev: any) => ({ ...prev, generalPlaceId: 'general-resolved' }) },
  });
  const props = { visible: true, initial: null, allowPlaces: true, confirmLabel: '경유지 추가', onClose() {}, onPick: (point: any) => { picked.push(point); }, ...overrides };
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
  // 일반 장소 시트는 닫힌 채(place=null) 계속 붙어 있으므로 장소가 든 시트만 연 것으로 본다.
  const sheet = () => [...all('PlaceSheet'), ...all('TempSheet')].find(node => node.props.place);
  const tapFavorite = () => { all('Favorites')[0].props.onTapPlace(favorites.places[0]); render(); };
  return { props, render, all, flush, addresses, picked, placeQueries, sheet, tapFavorite, favorites };
}

test('지도에서 즐겨찾기를 선택하면 ID를 보존하고 이전 역지오코딩이 덮지 않는다', async () => {
  const f = setup();
  f.all('Map')[0].props.onTapMap({ latitude: 37, longitude: 127 }); f.render();
  f.tapFavorite();
  f.addresses[0].resolve('이전 지도 탭 주소'); await f.flush();
  f.sheet().props.pickAction.onPress();
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
  f.all('Map')[0].props.onCameraIdle({ latitude: 37.5, longitude: 127, zoom: 16 }); await f.flush();
  hit = f.all('Pressable').find(node => node.props.accessibilityLabel?.includes('즐겨찾기 선택'));
  hit.props.onPress(); f.render();
  f.sheet().props.pickAction.onPress();
  assert.equal(f.picked[0].placeId, 'favorite');
});
test('지도에서 선택에도 메인 지도처럼 등록(바이크 특화) 장소 마커를 보여 주고 선택하면 ID를 보존한다', async () => {
  const f = setup(), map = f.all('Map')[0];
  map.props.ref.current = { coordinateToScreen: async () => ({ isValid: true, screenX: 120, screenY: 200 }) };
  map.props.onInitialized(); await f.flush();
  assert(f.placeQueries.some(q => q.enabled && q.center), '열자마자 초기 카메라 범위로 조회');
  const layer = f.all('Registered')[0];
  assert.deepEqual(layer.props.places.map((p: any) => p.id), ['repair']);
  assert(f.all('Pressable').some(node => node.props.accessibilityLabel === '바이크 정비소, 장소 선택'));
  layer.props.onTap(layer.props.places[0]); f.render();
  f.sheet().props.pickAction.onPress();
  assert.equal(f.picked[0].placeId, 'repair'); assert.equal(f.picked[0].address, '정비소 주소');
});

test('장소를 고르면 상세 시트에 경유지 추가 버튼만 두고 하단 확인 바는 숨긴다', async () => {
  const f = setup();
  f.tapFavorite();
  assert.equal(f.sheet().type, 'PlaceSheet'); assert.equal(f.sheet().props.pickAction.label, '경유지 추가');
  assert.equal(f.all('Pressable').some(node => node.props.accessibilityLabel === '경유지 추가'), false);
  f.sheet().props.onClose(); f.render();
  assert.equal(f.sheet(), undefined);
  assert(f.all('Pressable').some(node => node.props.accessibilityLabel === '경유지 추가'));
});

test('일반 장소 심벌을 탭하면 일반 장소 상세로 고르고, 빈 지도 탭이 그 선택을 좌표 핀으로 덮지 않는다', async () => {
  const f = setup();
  assert.equal(f.all('TempSheet')[0].props.place, null, '일반 장소 시트는 닫힌 채 미리 붙어 있다');
  f.all('Map')[0].props.onTapSymbol({ latitude: 37.51, longitude: 127.01, caption: '동네 국밥' }); await f.flush();
  assert.equal(f.sheet().type, 'TempSheet'); assert.equal(f.sheet().props.place.name, '동네 국밥');
  assert.equal(f.all('TempSheet').length, 1, '장소가 들어오기 전부터 붙어 있던 같은 시트를 연다');
  assert.equal(f.sheet().props.place.generalPlaceId, 'general-resolved');
  f.sheet().props.pickAction.onPress();
  assert.equal(f.picked[0].name, '동네 국밥'); assert.equal(f.picked[0].generalPlaceId, 'general-resolved');
  const lookups = f.addresses.length;
  f.all('Map')[0].props.onTapMap({ latitude: 37, longitude: 127 }); f.render();
  assert.equal(f.sheet(), undefined); assert.equal(f.addresses.length, lookups, '시트를 닫는 탭은 새 지점을 찍지 않는다');
  assert.equal(f.all('Marker').filter(node => node.props.image === 'pin').length, 0);
});

test('길찾기 지점 선택은 핀 없이 열리고, 위험 제보 선택기는 초기 위치 핀을 유지한다', () => {
  const route = setup({ initial: { latitude: 37.5, longitude: 127 } });
  const confirm = route.all('Pressable').find(node => node.props.accessibilityLabel === '경유지 추가');
  assert.equal(confirm.props.disabled, true); assert.equal(route.addresses.length, 0);
  const hazard = setup({ initial: { latitude: 37.5, longitude: 127 }, allowPlaces: false, confirmLabel: undefined });
  assert.equal(hazard.all('Marker').length, 1); assert.equal(hazard.addresses.length, 1);
});


test('장소를 고르면 원형 마커 대신 그 장소 핀만 남고, 찍은 지점 핀이 겹치지 않는다', async () => {
  const f = setup();
  f.all('Map')[0].props.onTapMap({ latitude: 37, longitude: 127 }); f.render();
  assert.equal(f.all('Marker').filter(node => node.props.image === 'pin').length, 1, '빈 지도 탭은 좌표 핀');
  f.tapFavorite();
  assert.equal(f.all('Favorites')[0].props.selectedPlaceId, 'favorite', '고른 즐겨찾기 원형은 뺀다');
  assert.deepEqual(f.all('Marker').map(node => node.props.image), ['favorite-pin']);
  f.sheet().props.onClose(); f.render();
  assert.equal(f.all('Favorites')[0].props.selectedPlaceId, null);
  assert.equal(f.all('Marker').length, 0);

  f.all('Favorites')[0].props.onTapGeneral(f.favorites.general[0]); f.render();
  assert.equal(f.all('Favorites')[0].props.selectedGeneralId, 'fav-general');
  assert.deepEqual(f.all('Marker').map(node => node.props.image), ['general-favorite-pin']);
  assert.equal(f.sheet().props.place.generalPlaceId, 'general-saved');

  f.sheet().props.onClose(); f.render();
  f.all('Map')[0].props.onTapSymbol({ latitude: 37.51, longitude: 127.01, caption: '동네 국밥' }); f.render();
  assert.equal(f.all('TempMarker').length, 1, '즐겨찾기 아닌 일반 장소는 메인 지도와 같은 일반 장소 핀');
  assert.equal(f.all('Marker').length, 0);
});
