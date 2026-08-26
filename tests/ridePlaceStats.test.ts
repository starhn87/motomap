import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlaceRidesForArrival,
  findPersonalPlaceRideIds,
} from '@/lib/ridePlaceStats';

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

test('집 도착과 회사 경유는 기록을 남기되 장소 통계에서 제외한다', () => {
  assert.deepEqual(
    buildPlaceRidesForArrival(
      {
        name: '저장된 집 근처 POI',
        latitude: 37.5002,
        longitude: 127,
        placeId: 'home-place',
      },
      [
        {
          placeId: 'work-place',
          latitude: 37.4,
          longitude: 127.1,
        },
        {
          placeId: 'cafe-place',
          latitude: 37.6,
          longitude: 127.2,
        },
      ],
      places,
    ),
    [
      {
        place_id: 'home-place',
        role: 'goal',
        excluded_from_place_stats: true,
      },
      {
        place_id: 'work-place',
        role: 'via',
        excluded_from_place_stats: true,
      },
      {
        place_id: 'cafe-place',
        role: 'via',
        excluded_from_place_stats: false,
      },
    ],
  );
});

test('일반 목적지도 집이면 제외 상태와 기존 식별자를 함께 기록한다', () => {
  assert.deepEqual(
    buildPlaceRidesForArrival(
      {
        name: '우리 집',
        latitude: 37.5,
        longitude: 127,
        generalPlaceId: 'general-home',
      },
      [],
      places,
    ),
    [{
      role: 'goal',
      name: '우리 집',
      latitude: 37.5,
      longitude: 127,
      excluded_from_place_stats: true,
      general_place_id: 'general-home',
    }],
  );
});

test('과거 기록은 로컬 좌표 비교 후 일치한 기록 id만 고른다', () => {
  assert.deepEqual(
    findPersonalPlaceRideIds(
      [
        { ride_id: 'home-ride', latitude: 37.5002, longitude: 127 },
        { ride_id: 'work-ride', latitude: 37.4, longitude: 127.1 },
        { ride_id: 'cafe-ride', latitude: 37.6, longitude: 127.2 },
      ],
      places,
    ),
    ['home-ride', 'work-ride'],
  );
});
