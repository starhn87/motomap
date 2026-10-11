import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import * as distance from '../lib/distance';
import * as region from '../lib/region';
import type * as API from '../lib/api/generalPlaces';

const id = '00000000-0000-4000-8000-000000000001';
const oldRow = { id, provider: 'coordinate', provider_place_id: 'original-coordinate-key', name: '테스트 빌라',
  address: '서울 테스트구 테스트로 1', latitude: 37.5, longitude: 127.1, phone: null, place_url: null,
  promoted_place_id: null, rating: 5, review_count: 2, share_count: 1 };
const input = { name: oldRow.name, address: oldRow.address, latitude: 37.5002, longitude: 127.1,
  placeUrl: 'https://map.naver.com/p/search/test' };

function fixture(rows = [oldRow]) {
  let inserts = 0;
  const api = loadModule<typeof API>('lib/api/generalPlaces.ts', {
    '@/lib/distance': distance, '@/lib/region': region,
    '@/lib/supabase': { supabase: { from: () => {
      const filters: ((row: typeof oldRow) => boolean)[] = [];
      const request = {
        select: () => request,
        eq: (key: keyof typeof oldRow, value: unknown) => { filters.push((row) => row[key] === value); return request; },
        gte: (key: 'latitude' | 'longitude', value: number) => { filters.push((row) => row[key] >= value); return request; },
        lte: (key: 'latitude' | 'longitude', value: number) => { filters.push((row) => row[key] <= value); return request; },
        maybeSingle: async () => ({ data: rows.find((row) => filters.every((fn) => fn(row))) ?? null, error: null }),
        limit: async (count: number) => ({ data: rows.filter((row) => filters.every((fn) => fn(row))).slice(0, count), error: null }),
        insert: () => { inserts++; throw new Error('unexpected insert'); },
      };
      return request;
    } } },
  });
  return { api, inserts: () => inserts };
}

test('알려진 일반 장소 UUID는 공급자 좌표가 바뀌어도 기존 리뷰·기록 행을 재사용한다', async () => {
  const { api, inserts } = fixture();
  const canonical = { ...input, generalPlaceId: id };
  const result = await api.ensureGeneralPlace(canonical);
  assert.equal(result.id, id); assert.equal(result.reviewCount, 2); assert.equal(inserts(), 0);
  assert.deepEqual(Array.from(api.generalPlaceQueryKey(canonical)), ['general-place', 'id', id]);
});

test('사라진 canonical UUID는 별도 일반 장소를 생성하지 않는다', async () => {
  const { api, inserts } = fixture([]);
  await assert.rejects(api.ensureGeneralPlace({ ...input, generalPlaceId: id }), /general_place_unavailable/);
  assert.equal(inserts(), 0);
});

test('네이버 좌표 차이는 이름·주소가 일치하는 유일한 행만 읽어 연결한다', async () => {
  const { api, inserts } = fixture();
  const result = await api.findGeneralPlace(input);
  assert.equal(result?.id, id); assert.equal(inserts(), 0);
  assert.equal((await api.findGeneralPlace({ ...input, address: '서울 다른주소 2' })), null);
  assert.equal((await api.findGeneralPlace({ ...input, name: '같은 건물의 다른 카페' })), null);
  assert.equal((await api.findGeneralPlace({ ...input, placeUrl: undefined })), null);
  const ambiguous = fixture([oldRow, { ...oldRow, id: '00000000-0000-4000-8000-000000000002', latitude: 37.5001 }]);
  assert.equal(await ambiguous.api.findGeneralPlace(input), null);
});

test('coordinate 행의 기존 키를 카카오 ID로 오인하거나 재계산하지 않는다', () => {
  const { api } = fixture();
  const identity = api.generalPlaceIdentity({ ...input, provider: 'coordinate', providerId: oldRow.provider_place_id });
  assert.equal(identity.provider, 'coordinate'); assert.equal(identity.providerId, oldRow.provider_place_id);
});
