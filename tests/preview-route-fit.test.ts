import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

// 실제 컴포넌트를 렌더해 지도 초기화·카드 실측 순서와 SDK 호출 계약을 검사한다.
function previewHarness() {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const calls: any[] = [];
  const camera = { animateCameraWithTwoCoords: (value: unknown) => calls.push(value) };
  const react = {
    useRef: (initial: unknown) => {
      const index = cursor++;
      return slots[index] ??= { current: index === 0 ? camera : initial };
    },
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = value; }];
    },
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => void, deps: any[]) => {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => dep !== previous[i])) effects.push(fn);
      slots[index] = deps;
    },
  };
  const jsx = (type: unknown, props: any) => ({ type, props });
  const noop = () => {};
  const { default: PreviewMap } = loadModule<{ default: (props: any) => any }>(
    'components/navi/PreviewMap.tsx', {
      react,
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { StyleSheet: { absoluteFill: {} } },
      'expo-router': { useRouter: () => ({ push: noop }) },
      '@tanstack/react-query': { useQueryClient: () => ({}) },
      '@mj-studio/react-native-naver-map': {
        NaverMapView: 'map', NaverMapPathOverlay: 'path',
        NaverMapMultiPathOverlay: 'multi-path', NaverMapMarkerOverlay: 'marker',
      },
      '@/lib/distance': { approxMeters: () => 100 },
      '@/modules/kakao-navi': { latLngsFromFlat: (flat: number[]) => Array.from({ length: flat.length / 2 }, (_, i) => ({ longitude: flat[i * 2], latitude: flat[i * 2 + 1] })) },
      '@/components/map/TempPlaceMarker': {},
      '@/hooks/usePlaces': { usePlaces: () => ({}), isInMapRenderWindow: () => true },
      '@/hooks/useFavorites': { useFavorites: () => ({}) },
      '@/constants/markerImages': { MARKER_IMAGES: {} },
      '@/constants/Colors': { semantic: { success: '#22C55E', danger: '#EF4444' } },
      '@/components/useColorScheme': { useColorScheme: () => 'light' },
      '@/lib/analytics': { track: {} },
      '@/lib/queryKeys': { queryKeys: {} },
    },
  );
  return {
    calls,
    render: (props: any) => {
      cursor = 0;
      effects = [];
      const tree = PreviewMap(props);
      effects.forEach((fn) => fn());
      return tree.props;
    },
  };
}

test('세로 경로는 지도 초기화와 상하 카드 실측 뒤 가시 영역으로 맞추고 높이 변경을 반영한다', () => {
  const harness = previewHarness();
  const route = { polyline: [127, 34, 127.01, 36, 127, 38] };
  const props = {
    start: null, goal: { latitude: 38, longitude: 127 }, viaMarkers: [],
    route, trafficParts: undefined, topCardH: null, bottomCardH: null,
  };
  let map = harness.render(props);
  assert.equal(harness.calls.length, 0);
  map.onInitialized();
  harness.render(props);
  assert.equal(harness.calls.length, 0, '실측 전 임의 높이로 맞추지 않는다');
  map = harness.render({ ...props, topCardH: 220, bottomCardH: 320 });
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(map.mapPadding)), { top: 268, bottom: 352, left: 32, right: 32 });
  const fit = harness.calls[0];
  assert.equal(fit.coord1.latitude, 34);
  assert.equal(fit.coord2.latitude, 38);
  assert.equal(fit.coord2.longitude, 127.01, '경로 중간의 가장 바깥 지점도 포함한다');
  map = harness.render({ ...props, topCardH: 220, bottomCardH: 380 });
  assert.equal(map.mapPadding.bottom, 412);
  assert.equal(harness.calls.length, 2, '같은 경로라도 결과 카드 높이가 바뀌면 다시 맞춘다');
  harness.render({ ...props, topCardH: 220, bottomCardH: 380 });
  assert.equal(harness.calls.length, 2, '일반 재렌더가 사용자 카메라를 되돌리지 않는다');
});

function overlays(map: any) {
  return map.children.flat(Infinity).filter((node: any) => node && ['path', 'multi-path'].includes(node.type));
}

test('모든 유효 옵션을 그리고 비활성 경로는 회색·선택 경로는 더 높은 레이어로 유지한다', () => {
  const h = previewHarness();
  const route = { polyline: [127, 37, 128, 38] };
  const other = { polyline: [127, 37, 129, 38] };
  const props = {
    start: null, goal: { latitude: 38, longitude: 128 }, viaMarkers: [],
    route, trafficParts: undefined, priority: 0, topCardH: 150, bottomCardH: 250,
    alternatives: [{ value: 0, route }, { value: 1, route: other }, { value: 2, route: { polyline: [] } }],
  };
  h.render(props).onInitialized();
  let map = h.render(props);
  let paths = overlays(map);
  assert.equal(paths.length, 2, '빈 경로와 선택 경로의 중복 회색선을 제외한다');
  const inactive = paths.find((node: any) => node.props.color === '#9CA3AF');
  const active = paths.find((node: any) => node.props.color === '#22C55E');
  assert.equal(inactive.props.coords[1].longitude, 129);
  assert.equal(inactive.props.globalZIndex, active.props.globalZIndex);
  assert.ok(inactive.props.zIndex < active.props.zIndex);
  assert.ok(inactive.props.width < active.props.width);
  assert.equal(h.calls.length, 1);
  map = h.render({ ...props, alternatives: [...props.alternatives, { value: 4, route: other }] });
  assert.equal(overlays(map).length, 3);
  assert.equal(h.calls.length, 1, '배경 옵션 응답이 사용자 카메라를 되돌리지 않는다');
  paths = overlays(h.render({ ...props, priority: 1, route: other }));
  assert.equal(paths.find((node: any) => node.props.color === '#22C55E').props.coords[1].longitude, 129);
  assert.equal(paths.find((node: any) => node.props.color === '#9CA3AF').props.coords[1].longitude, 128);
});

test('교통정보 색은 선택 경로에만 유지하고 회색 비교 경로 아래에 묻히지 않는다', () => {
  const h = previewHarness();
  const route = { polyline: [127, 37, 128, 38] };
  const parts = [{ state: 2, coords: [{ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 128 }] }];
  const paths = overlays(h.render({
    start: null, goal: { latitude: 38, longitude: 128 }, viaMarkers: [], route,
    priority: 0, alternatives: [{ value: 0, route }, { value: 1, route }],
    trafficParts: parts, topCardH: 150, bottomCardH: 250,
  }));
  const active = paths.find((node: any) => node.type === 'multi-path');
  const inactive = paths.find((node: any) => node.type === 'path');
  assert.equal(paths.length, 2);
  assert.equal(active.props.pathParts[0].color, '#EF4444');
  assert.equal(inactive.props.color, '#9CA3AF');
  assert.ok(active.props.zIndex > inactive.props.zIndex);
});

test('배경 조회로 카드 높이가 바뀌어도 사용자 카메라를 보존하고 경로 선택 시 다시 맞춘다', () => {
  const h = previewHarness();
  const route = { polyline: [127, 37, 128, 38] };
  const alternative = { polyline: [127, 37, 129, 38] };
  const props = {
    start: null, goal: { latitude: 38, longitude: 128 }, viaMarkers: [],
    route, priority: 0, trafficParts: undefined, alternatives: [{ value: 0, route }],
    topCardH: 150, bottomCardH: 250,
  };
  h.render(props).onInitialized();
  h.render(props).onCameraChanged({ reason: 'Gesture' });
  assert.equal(h.calls.length, 1);
  const completed = { ...props, bottomCardH: 290, alternatives: [...props.alternatives, { value: 1, route: alternative }] };
  h.render(completed);
  assert.equal(h.calls.length, 1, '조회 완료와 레이아웃 변경이 사용자 팬·줌을 덮지 않는다');
  h.render({ ...completed, priority: 1, route: alternative });
  assert.equal(h.calls.length, 2, '다른 경로 선택은 명시적인 카메라 맞춤이다');
  assert.equal(h.calls[1].coord2.longitude, 129);
});
