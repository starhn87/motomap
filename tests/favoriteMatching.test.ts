import assert from 'node:assert/strict';
import test from 'node:test';
import { favoriteMatcher, favoritesFirst } from '../lib/favoriteMatching';
test('즐겨찾기는 등록/일반 그룹보다 우선하고 그룹 내부 원래 순서는 유지한다', () => {
  const favorites: any = { places: [{ id: 'registered' }], general: [{ generalPlaceId: 'canonical', latitude: 37, longitude: 127 }] };
  const items: any[] = [{ kind: 'place', place: { id: 'other' } },
    { kind: 'kakao', k: { generalPlaceId: 'canonical', latitude: 37.001, longitude: 127 } },
    { kind: 'place', place: { id: 'registered' } }, { kind: 'riding' }];
  const ranked = favoritesFirst(items, favoriteMatcher(favorites));
  assert.deepEqual(ranked, [items[1], items[2], items[0], items[3]]);
});
