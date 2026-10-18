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
    useRef: () => {
      const index = cursor++;
      return slots[index] ??= { current: camera };
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
      '@mj-studio/react-native-naver-map': { NaverMapView: 'map' },
      '@/lib/distance': { approxMeters: () => 100 },
      '@/modules/kakao-navi': { latLngsFromFlat: () => [] },
      '@/components/map/TempPlaceMarker': {},
      '@/hooks/usePlaces': { usePlaces: () => ({}), isInMapRenderWindow: () => true },
      '@/hooks/useFavorites': { useFavorites: () => ({}) },
      '@/constants/markerImages': { MARKER_IMAGES: {} },
      '@/constants/Colors': { semantic: {} },
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
