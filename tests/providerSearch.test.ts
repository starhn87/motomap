import assert from 'node:assert/strict';
import test from 'node:test';
import * as providerErrors from '../lib/providerErrors';
import * as region from '../lib/region';
import * as distance from '../lib/distance';
import { isSameExternalPlace } from '../lib/searchMatching';
import { loadModule } from './helpers/loadModule';
import { allowedLocationPrivacy } from './helpers/allowedLocationPrivacy';

type KakaoModule = {
  searchKakaoLocalPage: (query: string, near?: { latitude: number; longitude: number },
    options?: { signal?: AbortSignal; throwOnError?: boolean }) => Promise<{ results: unknown[]; isEnd: boolean }>;
};
const validBody = {
  documents: [{ id: 'test', place_name: '테스트 카페', x: '127.1', y: '37.5', address_name: '경기도 테스트' }],
  meta: { total_count: 1, pageable_count: 1, is_end: true },
};

function kakaoFixture(options: { status?: number; body?: unknown; key?: string; hangs?: boolean; jsonError?: boolean } = {}) {
  const errors = loadModule<typeof providerErrors>('lib/providerErrors.ts', {});
  let requests = 0;
  const api = loadModule<KakaoModule>('lib/api/kakaoLocal.ts', {
    '@/lib/distance': distance, '@/lib/region': region, '@/lib/providerErrors': errors,
    '@/stores/useLocationPrivacyStore': allowedLocationPrivacy,
  }, {
    AbortController, process: { env: { EXPO_PUBLIC_KAKAO_REST_API_KEY: options.key ?? 'test-only-key' } },
    // 제한 시간의 실제 분기는 유지하되 공급자 호출 없이 빠르게 재현한다.
    setTimeout: (fn: () => void) => setTimeout(fn, 20),
    fetch: async (_url: string, { signal }: { signal: AbortSignal }) => {
      requests++;
      if (options.hangs) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('network abort')), { once: true });
        });
      }
      return {
        ok: !options.status || options.status === 200, status: options.status ?? 200,
        json: async () => {
          if (options.jsonError) throw new SyntaxError('invalid json');
          return options.body === undefined ? validBody : options.body;
        },
      };
    },
  });
  return { api, errors, requests: () => requests };
}

test('카카오의 정상 0건과 응답 오류를 구분한다', async () => {
  const empty = kakaoFixture({ body: { documents: [], meta: { total_count: 0, pageable_count: 0, is_end: true } } });
  assert.equal((await empty.api.searchKakaoLocalPage('카페')).results.length, 0);
  for (const body of [null, {}, { ...validBody, documents: [{ place_name: '오류', x: '', y: 'NaN' }] }]) {
    const { api } = kakaoFixture({ body });
    await assert.rejects(api.searchKakaoLocalPage('카페'), (error: unknown) =>
      (error as providerErrors.ProviderError).kind === 'invalid_response');
  }
  const invalidJson = kakaoFixture({ jsonError: true });
  await assert.rejects(invalidJson.api.searchKakaoLocalPage('카페'), (error: unknown) =>
    (error as providerErrors.ProviderError).kind === 'invalid_response');
});

test('401/403/누락 키는 설정 오류이며 새 검색에서도 실제 요청을 반복하지 않는다', async () => {
  for (const status of [401, 403]) {
    const { api, requests } = kakaoFixture({ status });
    for (const query of ['카페', '정비소']) {
      await assert.rejects(api.searchKakaoLocalPage(query), (error: unknown) =>
        (error as providerErrors.ProviderError).kind === 'configuration');
    }
    assert.equal(requests(), 1);
  }
  const missing = kakaoFixture({ key: '' });
  await assert.rejects(missing.api.searchKakaoLocalPage('카페'));
  assert.equal(missing.requests(), 0);
});

test('429/5xx 오류·취소·타임아웃을 구분하고 원문을 노출하지 않는다', async () => {
  for (const [status, kind] of [[429, 'rate_limited'], [500, 'temporary']] as const) {
    const { api } = kakaoFixture({ status });
    await assert.rejects(api.searchKakaoLocalPage('개인 검색어'), (error: unknown) => {
      assert.equal((error as providerErrors.ProviderError).kind, kind);
      assert.equal((error as Error).message.includes('개인 검색어'), false);
      assert.equal((error as Error).message.includes('test-only-key'), false);
      return true;
    });
  }
  const timeout = kakaoFixture({ hangs: true });
  await assert.rejects(timeout.api.searchKakaoLocalPage('카페'), (error: unknown) =>
    (error as providerErrors.ProviderError).kind === 'timeout');
  const cancelled = kakaoFixture({ hangs: true });
  const controller = new AbortController();
  const request = cancelled.api.searchKakaoLocalPage('카페', undefined, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error: unknown) => (error as providerErrors.ProviderError).kind === 'cancelled');
  const before = kakaoFixture();
  await assert.rejects(before.api.searchKakaoLocalPage('카페', undefined, { signal: controller.signal }));
  assert.equal(before.requests(), 0);
});

test('선택적 POI 보완만 명시적 폴백을 허용하고 완료된 0건으로 위장하지 않는다', async () => {
  const { api } = kakaoFixture({ status: 500 });
  const result = await api.searchKakaoLocalPage('카페', undefined, { throwOnError: false });
  assert.equal(result.results.length, 0);
  assert.equal(result.isEnd, false);
});

test('재시도는 일시 실패 최대 1회이며 설정·429·취소는 재시도하지 않는다', () => {
  for (const kind of ['configuration', 'rate_limited', 'cancelled', 'invalid_response', 'invalid_request'] as const) {
    assert.equal(providerErrors.retryProviderQuery(0, new providerErrors.ProviderError('kakao-local', 'search', kind)), false);
  }
  assert.equal(providerErrors.retryProviderQuery(0, new providerErrors.ProviderError('kakao-local', 'search', 'temporary')), true);
  assert.equal(providerErrors.retryProviderQuery(1, new providerErrors.ProviderError('kakao-local', 'search', 'temporary')), false);
});

type SearchModule = {
  searchUnifiedPlaces: (query: string, near?: undefined, options?: { signal?: AbortSignal }) => Promise<{
    places: { name: string }[]; ridingGuides: unknown[]; kakaoOnly: unknown[]; failedSources?: string[];
  }>;
};
function searchFixture(options: { placesFail?: boolean; guidesFail?: boolean; kakaoFail?: boolean } = {}) {
  return loadModule<SearchModule>('lib/api/search.ts', {
    '@/stores/useLocationPrivacyStore': allowedLocationPrivacy,
    '@/lib/supabase': { supabase: { rpc: (name: string) => {
      const failed = name === 'search_places_v2' ? options.placesFail : options.guidesFail;
      const data = name === 'search_places_v2'
        ? [{ id: 'registered', name: '테스트 카페', latitude: 37.5, longitude: 127.1 }]
        : [{ id: 'riding', title: '테스트 라이딩' }];
      const request = Promise.resolve({ data: failed ? null : data, error: failed ? { code: '42501' } : null, status: failed ? 403 : 200 });
      return Object.assign(request, { abortSignal: () => request });
    } } },
    '@/lib/api/places': { rowToPlace: (row: unknown) => row },
    '@/lib/api/externalPlaces': { searchExternalPlacesPage: async () => {
      if (options.kakaoFail) throw new providerErrors.ProviderError('kakao-local', 'search', 'temporary');
      return { results: [{ placeName: '테스트 카페', latitude: 37.5, longitude: 127.1 },
        { placeName: '다른 카페', latitude: 37.6, longitude: 127.2 }] };
    } },
    '@/lib/searchMatching': { isSameExternalPlace }, '@/lib/providerErrors': providerErrors,
    '@/lib/distance': distance,
  });
}

test('통합 검색은 정상 중복을 제거하고 실패한 소스와 성공한 결과를 함께 반환한다', async () => {
  const normal = await searchFixture().searchUnifiedPlaces('카페');
  assert.equal(normal.places.length, 1); assert.equal(normal.kakaoOnly.length, 1);
  assert.equal(normal.failedSources?.length, 0);
  const kakaoFail = await searchFixture({ kakaoFail: true }).searchUnifiedPlaces('카페');
  assert.equal(kakaoFail.places.length, 1); assert.equal(kakaoFail.ridingGuides.length, 1);
  assert.deepEqual(Array.from(kakaoFail.failedSources ?? []), ['kakao', 'naver']);
  const placesFail = await searchFixture({ placesFail: true }).searchUnifiedPlaces('카페');
  assert.equal(placesFail.ridingGuides.length, 1); assert.equal(placesFail.kakaoOnly.length, 2);
  assert.deepEqual(Array.from(placesFail.failedSources ?? []), ['places']);
  const guidesFail = await searchFixture({ guidesFail: true }).searchUnifiedPlaces('카페');
  assert.equal(guidesFail.places.length, 1); assert.equal(guidesFail.kakaoOnly.length, 1);
  assert.deepEqual(Array.from(guidesFail.failedSources ?? []), ['ridingGuides']);
  const backendFail = await searchFixture({ placesFail: true, guidesFail: true }).searchUnifiedPlaces('카페');
  assert.equal(backendFail.kakaoOnly.length, 2);
  assert.deepEqual(Array.from(backendFail.failedSources ?? []), ['places', 'ridingGuides']);
});

test('전체 실패와 취소는 0건 성공으로 반환하지 않는다', async () => {
  await assert.rejects(searchFixture({ placesFail: true, guidesFail: true, kakaoFail: true }).searchUnifiedPlaces('카페'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchFixture().searchUnifiedPlaces('카페', undefined, { signal: controller.signal }),
    (error: unknown) => (error as providerErrors.ProviderError).kind === 'cancelled');
});
