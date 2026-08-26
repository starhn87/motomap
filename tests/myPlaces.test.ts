import assert from 'node:assert/strict';
import test from 'node:test';

import { findNearbySavedPlaceSlot, findSavedPlaceSlot } from '@/lib/myPlaces';

const places = {
  home: {
    name: '집',
    address: '서울',
    latitude: 37.5,
    longitude: 127,
  },
  work: {
    name: '회사',
    address: '성남',
    latitude: 37.4,
    longitude: 127.1,
  },
};

test('좌표가 같은 내 장소의 슬롯을 찾는다', () => {
  assert.equal(findSavedPlaceSlot(places, { latitude: 37.5, longitude: 127 }), 'home');
  assert.equal(findSavedPlaceSlot(places, { latitude: 37.4, longitude: 127.1 }), 'work');
});

test('저장되지 않은 좌표와 빈 대상은 null을 반환한다', () => {
  assert.equal(findSavedPlaceSlot(places, { latitude: 37.6, longitude: 127 }), null);
  assert.equal(findSavedPlaceSlot(places, null), null);
});

test('주행 통계 제외 판정은 좌표 공급자 차이만 흡수하는 40m 반경을 쓴다', () => {
  const nearbyHome = { latitude: 37.5002, longitude: 127 };
  assert.equal(findSavedPlaceSlot(places, nearbyHome), null);
  assert.equal(findNearbySavedPlaceSlot(places, nearbyHome), 'home');
  assert.equal(
    findNearbySavedPlaceSlot(places, { latitude: 37.501, longitude: 127 }),
    null,
  );
});
