import assert from 'node:assert/strict';
import test from 'node:test';

import { isSamePlace, isSameExternalPlace } from '@/lib/searchMatching';

const registered = { name: '티하우스 에덴', latitude: 37.5, longitude: 127 };

test('네이버 건물은 같은 좌표의 다른 상호를 숨기지 않고 정확한 이름만 합친다', () => {
  assert.equal(isSameExternalPlace(registered, { placeName: '테스트 빌라', latitude: 37.5, longitude: 127, source: 'naver' }), false);
  assert.equal(isSameExternalPlace(registered, { placeName: '티하우스에덴', latitude: 37.5004, longitude: 127, source: 'naver' }), true);
});

test('20m 안의 외부 POI는 표기 차이가 있어도 같은 장소로 본다', () => {
  assert.equal(
    isSamePlace(registered, {
      name: '티하우스에덴 본점',
      latitude: 37.5001,
      longitude: 127,
    }),
    true,
  );
});

test('150m 안에서는 공백을 제외한 이름 포함 관계를 확인한다', () => {
  assert.equal(
    isSamePlace(registered, {
      name: '티하우스에덴',
      latitude: 37.5004,
      longitude: 127,
    }),
    true,
  );
  assert.equal(
    isSamePlace(registered, {
      name: '전혀 다른 카페',
      latitude: 37.5004,
      longitude: 127,
    }),
    false,
  );
});

test('이름이 같아도 150m 밖이면 다른 장소로 본다', () => {
  assert.equal(
    isSamePlace(registered, {
      name: '티하우스 에덴',
      latitude: 37.502,
      longitude: 127,
    }),
    false,
  );
});
