import assert from 'node:assert/strict';
import test from 'node:test';
import { favoriteMatcher, favoritesFirst, mergeFavoriteCandidates, personalPlaceKind } from '../lib/favoriteMatching';
test('즐겨찾기는 등록/일반 그룹보다 우선하고 그룹 내부 원래 순서는 유지한다', () => {
  const favorites: any = { places: [{ id: 'registered' }], general: [{ generalPlaceId: 'canonical', latitude: 37, longitude: 127 }] };
  const items: any[] = [{ kind: 'place', place: { id: 'other' } },
    { kind: 'kakao', k: { generalPlaceId: 'canonical', latitude: 37.001, longitude: 127 } },
    { kind: 'place', place: { id: 'registered' } }, { kind: 'riding' }];
  const ranked = favoritesFirst(items, favoriteMatcher(favorites));
  assert.deepEqual(ranked, [items[1], items[2], items[0], items[3]]);
});

test('검색 후보 순서와 무관하게 즐겨찾기 다음에는 등록 장소가 먼저 온다', () => {
  const items: any[] = [{ kind: 'kakao', k: { placeName: '일반' } }, { kind: 'place', place: { id: 'registered' } }, { kind: 'kakao', k: { placeName: '즐겨찾기' } }];
  const ranked = favoritesFirst(items, item => item.kind === 'kakao' && item.k.placeName === '즐겨찾기', item => item.kind === 'place');
  assert.deepEqual(ranked, [items[2], items[1], items[0]]);
});
test('좌표로 저장한 즐겨찾기와 검색 좌표가 조금 달라도 이름·주소가 같으면 우선 표시한다', () => {
  const favorites: any = { places: [], general: [{ name: '모토 카페', address: '서울 강남구 테스트로 12', latitude: 37.5, longitude: 127, generalPlaceId: 'canonical' }] };
  const item: any = { kind: 'kakao', k: { placeName: '모토 카페', roadAddress: '서울특별시 강남구 테스트로 12', latitude: 37.5001, longitude: 127, providerId: 'kakao-1' } };
  assert.equal(favoriteMatcher(favorites)(item), true);
});

test('저장 장소가 공급자 결과에서 빠져도 보완하고 지도 반경과 중복 제거는 지킨다', () => {
  const saved: any = { id: 'saved', name: '모토 카페', address: '서울 강남구', latitude: 37.5, longitude: 127 };
  const favorite: any = { id: 'external', name: '모토 정비', address: '서울 강남구', latitude: 37.5, longitude: 127.001 };
  const favorites: any = { places: [saved], general: [favorite, { ...favorite, id: 'far', name: '모토 먼곳', latitude: 38.5 }] };
  const result = mergeFavoriteCandidates({ places: [], kakaoOnly: [] }, favorites, '모토', { center: saved, radius: 20000 });
  assert.deepEqual(result.places.map(p => p.id), ['saved']);
  assert.deepEqual(result.kakaoOnly.map(p => p.placeName), ['모토 정비']);
  const repeated = mergeFavoriteCandidates(result, favorites, '모토', { center: saved, radius: 20000 });
  assert.equal(repeated.places.length, 1); assert.equal(repeated.kakaoOnly.length, 1);
});
test('같은 상호의 다른 지점이나 서로 다른 알려진 ID는 즐겨찾기로 합치지 않는다', () => {
  const favorite: any = { name: '모토', address: '서울 강남구 A로', latitude: 37.5, longitude: 127, generalPlaceId: 'a', providerId: 'provider-a' };
  const match = favoriteMatcher({ places: [], general: [favorite] });
  assert.equal(match({ kind: 'kakao', k: { ...favorite, placeName: '모토', generalPlaceId: undefined, providerId: 'provider-b' } } as any), false);
  assert.equal(match({ kind: 'kakao', k: { ...favorite, placeName: '모토', generalPlaceId: 'b' } } as any), false);
  assert.equal(match({ kind: 'kakao', k: { ...favorite, providerId: undefined, generalPlaceId: undefined, placeName: '모토', address: '서울 다른주소', latitude: 37.5002 } } as any), false);
});
test('집과 회사는 이름·주소·위치로 구분하며 다른 지점은 일반 장소로 남긴다', () => {
  const home = { name: '내 장소', address: '서울 A로', latitude: 37.5, longitude: 127 };
  const work = { ...home, name: '회사 장소', longitude: 127.01 };
  assert.equal(personalPlaceKind({ ...home, address: '서울특별시 A로', latitude: 37.5001 }, { home, work }), 'home');
  assert.equal(personalPlaceKind(work, { home, work }), 'work');
  assert.equal(personalPlaceKind({ ...home, latitude: 38 }, { home, work }), null);
});

test('같은 건물의 다른 상호 즐겨찾기는 등록 장소에 흡수하지 않는다', () => {
  const place: any = { id: 'cafe', name: '모토 카페', address: '서울 A로', latitude: 37.5, longitude: 127 };
  const favorite: any = { id: 'repair', generalPlaceId: 'repair-place', name: '모토 정비', address: '서울 A로', latitude: 37.50002, longitude: 127 };
  const result = mergeFavoriteCandidates({ places: [place], kakaoOnly: [] }, { places: [], general: [favorite] }, '모토');
  assert.equal(result.places.length, 1);
  assert.equal(result.kakaoOnly.length, 1);
  assert.equal(result.kakaoOnly[0].generalPlaceId, 'repair-place');
});
