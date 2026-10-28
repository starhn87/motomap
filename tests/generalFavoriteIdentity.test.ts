import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import * as favoriteMatching from '../lib/favoriteMatching';
import { queryKeys } from '../lib/queryKeys';
import type * as FavoritesAPI from '../lib/api/favorites';

const canonicalId = '00000000-0000-4000-8000-000000000001';
const old = { id: 'favorite-id', name: '테스트 빌라', address: '테스트 주소', latitude: 37.5, longitude: 127.1,
  generalPlaceId: canonicalId };
const newPoint = { name: old.name, address: old.address, latitude: 37.5002, longitude: 127.1, generalPlaceId: canonicalId };

function fixture() {
  let rows: any[] = [{ id: old.id, name: old.name, address: old.address, latitude: old.latitude,
    longitude: old.longitude, general_place_id: canonicalId, place_id: null, user_id: 'test-user' }];
  const api = loadModule<typeof FavoritesAPI>('lib/api/favorites.ts', {
    '@/lib/favoriteMatching': favoriteMatching,
    '@/lib/guidePoiChanges': { notifyGuideFavoritesChanged() {} },
    '@/lib/auth': { requireUser: async () => ({ id: 'test-user' }), getCurrentUser: async () => ({ id: 'test-user' }) },
    '@/lib/api/places': { rowToPlace: (row: unknown) => row },
    '@/lib/api/generalPlaces': { ensureGeneralPlace: async () => ({ id: canonicalId }) },
    '@/lib/supabase': { supabase: { from: () => ({
      select: () => ({ eq: async () => ({ data: rows, error: null }) }),
      insert: async (row: any) => {
        if (rows.some((oldRow) => oldRow.general_place_id === row.general_place_id)) return { error: { code: '23505' } };
        rows.push({ ...row, id: 'new-favorite' }); return { error: null };
      },
      delete: () => {
        const conditions: [string, unknown][] = [];
        const request = {
          eq: (key: string, value: unknown) => { conditions.push([key, value]); return request; },
          then: (resolve: (value: unknown) => unknown) => {
            rows = rows.filter((row) => !conditions.every(([key, value]) => row[key] === value));
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return request;
      },
    }) } },
  });
  return { api, rows: () => rows };
}

test('공급자 좌표가 달라도 canonical 즐겨찾기 표시·해제·다시 저장은 같은 행을 따른다', async () => {
  const { api, rows } = fixture();
  assert.equal(api.findGeneralFavorite([old], newPoint)?.id, old.id);
  await api.setGeneralFavorite({ place: newPoint, on: false });
  assert.equal(rows().length, 0);
  await api.setGeneralFavorite({ place: newPoint, on: true });
  assert.equal(rows()[0].general_place_id, canonicalId);
  assert.equal(api.findGeneralFavorite((await api.fetchFavorites()).general, { ...old, latitude: 37.4998 })?.id, 'new-favorite');
});

test('서로 다른 알려진 UUID/외부 ID는 같은 좌표여도 즐겨찾기를 공유하지 않는다', () => {
  const { api } = fixture();
  assert.equal(api.findGeneralFavorite([old], { ...old, generalPlaceId: 'other' }), undefined);
  assert.equal(api.findGeneralFavorite([{ ...old, generalPlaceId: undefined, providerId: 'kakao-one' }],
    { ...old, generalPlaceId: undefined, providerId: 'kakao-two' }), undefined);
  assert.equal(api.findGeneralFavorite([{ ...old, generalPlaceId: undefined }],
    { latitude: old.latitude, longitude: old.longitude })?.id, old.id);
});

test('일반 즐겨찾기 낙관적 캐시도 canonical UUID를 유지한다', async () => {
  const { api } = fixture();
  let cache = { placeIds: [], general: [] as FavoritesAPI.GeneralFavorite[] };
  const hooks = loadModule<any>('hooks/useFavorites.ts', {
    '@/lib/api/favorites': api, '@/lib/queryKeys': { queryKeys }, '@/lib/analytics': { track: {} },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user: { id: 'test-user' } }) },
    '@tanstack/react-query': { useMutation: (options: unknown) => options,
      useQueryClient: () => ({ cancelQueries: async () => {}, getQueryData: () => cache,
        setQueryData: (_key: unknown, next: typeof cache) => { cache = next; } }) },
  });
  const mutation = hooks.useToggleGeneralFavorite();
  await mutation.onMutate({ place: newPoint, on: true });
  assert.equal(cache.general[0].generalPlaceId, canonicalId);
  assert.ok(api.findGeneralFavorite(cache.general, old));
  await mutation.onMutate({ place: old, on: false });
  assert.equal(cache.general.length, 0);
});

test('장소 추천 캐시는 공급자 좌표가 아닌 canonical UUID로 통일한다', () => {
  const hooks = loadModule<any>('hooks/useCommunityPlaceSignals.ts', {
    '@/lib/api/communityPlaceSignals': {}, '@/lib/analytics': { track: {} }, '@/hooks/usePlaces': {},
    '@/lib/api/generalPlaces': { generalPlaceQueryKey: (place: typeof newPoint) => ['general-place', 'id', place.generalPlaceId] },
    '@/stores/useAuthStore': { useAuthStore: (select: any) => select({ user: { id: 'test-user' } }) },
    '@tanstack/react-query': { useQuery: (options: unknown) => options },
  });
  assert.deepEqual(Array.from(hooks.useGeneralPlaceShare(newPoint).queryKey), Array.from(hooks.useGeneralPlaceShare(old).queryKey));
});
