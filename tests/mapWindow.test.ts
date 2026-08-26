import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isInMapRenderWindow,
  mapRenderWindowRadius,
  type MapCenter,
} from '@/lib/mapWindow';

const center: MapCenter = {
  latitude: 37.55,
  longitude: 127.05,
  zoom: 12,
  // SDK region은 중심이 아니라 남서쪽 모서리다.
  region: {
    latitude: 37.5,
    longitude: 127.0,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  },
};

test('실제 화면의 네 모서리를 렌더 창에 포함한다', () => {
  assert.equal(isInMapRenderWindow({ latitude: 37.5, longitude: 127.0 }, center), true);
  assert.equal(isInMapRenderWindow({ latitude: 37.6, longitude: 127.1 }, center), true);
});

test('50% 여유 창 밖의 좌표는 제외한다', () => {
  assert.equal(isInMapRenderWindow({ latitude: 37.63, longitude: 127.05 }, center), false);
  assert.equal(isInMapRenderWindow({ latitude: 37.55, longitude: 127.13 }, center), false);
});

test('region이 준비되기 전에는 마커를 숨기지 않는다', () => {
  assert.equal(
    isInMapRenderWindow(
      { latitude: 33.4, longitude: 126.5 },
      { latitude: 37.5, longitude: 127, zoom: 12 },
    ),
    true,
  );
});

test('서버 조회 반경은 화면 대각선보다 큰 유효한 값이다', () => {
  const radius = mapRenderWindowRadius(center);
  assert.ok(radius !== null && radius > 8_000 && radius < 20_000);
});
