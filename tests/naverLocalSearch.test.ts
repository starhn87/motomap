import assert from 'node:assert/strict';
import test from 'node:test';
import { createNaverLocalHandler, parseNaverLocal } from '../supabase/functions/_shared/naverLocalSearch';
import { loadModule } from './helpers/loadModule';
import * as errors from '../lib/providerErrors';
import * as region from '../lib/region';

// 실제 사용자의 건물명·주소·좌표 대신 합성 응답으로 검증한다.
const item = { title: '<b>테스트</b> 빌라', address: '서울 테스트구 테스트동', roadAddress: '',
  telephone: '', mapx: '1271000000', mapy: '375000000' };
const body = { items: [item], total: 5, display: 5 };

test('네이버 좌표 단위와 HTML을 정규화하고 외부 ID를 만들지 않는다', () => {
  const [result] = parseNaverLocal(body);
  assert.equal(result.placeName, '테스트 빌라');
  assert.equal(result.latitude, 37.5); assert.equal(result.longitude, 127.1);
  assert.equal(result.source, 'naver'); assert.equal('providerId' in result, false);
  assert.match(result.placeUrl, /^https:\/\/map\.naver\.com\/p\/search\//);
  assert.deepEqual(parseNaverLocal({ items: [], total: 0 }), []);
  for (const override of [{ mapx: '' }, { mapy: 'NaN' }, { mapx: '127.1' }, { mapx: '375000000', mapy: '1271000000' },
    { title: '' }, { address: '', roadAddress: '' }]) {
    assert.throws(() => parseNaverLocal({ ...body, items: [{ ...item, ...override }] }));
  }
  assert.throws(() => parseNaverLocal({ total: 1 }));
});

function handlerFixture(options: { status?: number; missingKey?: boolean; limited?: boolean; brokenLimit?: boolean;
  response?: unknown } = {}) {
  let calls = 0;
  let lastUrl = '';
  const handle = createNaverLocalHandler({ clientId: options.missingKey ? '' : 'test-id', clientSecret: 'test-secret',
    limit: async () => {
      if (options.brokenLimit) throw new Error('private');
      return options.limited ? Response.json({}, { status: 429, headers: { 'Retry-After': '42' } }) : null;
    },
    fetch: async (url, init) => {
      calls++; lastUrl = String(url);
      assert.equal(new Headers(init?.headers).get('X-NCP-APIGW-API-KEY'), 'test-secret');
      return Response.json(options.response ?? body, { status: options.status ?? 200 });
    },
  });
  const request = (query: unknown = '테스트 빌라') => handle(new Request('https://local.test', {
    method: 'POST', body: JSON.stringify({ query }),
  }));
  return { handle, request, calls: () => calls, lastUrl: () => lastUrl };
}

test('프록시는 고정 API·최대5건·no-store를 사용하고 키와 검색어를 응답하지 않는다', async () => {
  const fixture = handlerFixture();
  const response = await fixture.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const url = new URL(fixture.lastUrl());
  assert.equal(url.origin, 'https://naverapihub.apigw.ntruss.com');
  assert.equal(url.searchParams.get('display'), '5');
  assert.equal((await response.text()).includes('test-secret'), false);
});

test('잘못된 요청·본문 초과·키 누락·호출 제한은 공급자를 호출하지 않는다', async () => {
  const fixture = handlerFixture();
  for (const query of ['', 'a', 'a'.repeat(151), 'ab\u0000', 123]) assert.equal((await fixture.request(query)).status, 400);
  assert.equal((await fixture.request('a'.repeat(3000))).status, 413);
  assert.equal((await fixture.handle(new Request('https://local.test'))).status, 405);
  assert.equal((await fixture.handle(new Request('https://local.test', { method: 'OPTIONS' }))).status, 204);
  assert.equal(fixture.calls(), 0);
  for (const options of [{ missingKey: true }, { limited: true }, { brokenLimit: true }]) {
    const blocked = handlerFixture(options);
    const response = await blocked.request();
    assert.equal(response.status, options.limited ? 429 : 503); assert.equal(blocked.calls(), 0);
    if (options.limited) assert.equal(response.headers.get('Retry-After'), '42');
  }
});

test('공급자 실패와 잘못된 응답은 0건 성공이 아니다', async () => {
  for (const [status, kind] of [[403, 'configuration'], [429, 'rate_limited'], [500, 'temporary']] as const) {
    const response = await handlerFixture({ status }).request();
    assert.equal((await response.json()).kind, kind); assert.notEqual(response.status, 200);
  }
  const invalid = await handlerFixture({ response: { items: [{}], total: 1 } }).request();
  assert.equal((await invalid.json()).kind, 'invalid_response');
});

type External = typeof import('../lib/api/externalPlaces');
function externalFixture(options: { kakaoFails?: boolean; kakaoEmpty?: boolean; naverFails?: boolean; naverEmpty?: boolean } = {}) {
  let naverCalls = 0;
  const api = loadModule<External>('lib/api/externalPlaces.ts', {
    '@/lib/providerErrors': errors,
    '@/lib/placeCatalogSuppression': loadModule('lib/placeCatalogSuppression.ts', {}),
    '@/lib/api/kakaoLocal': { searchKakaoLocalPage: async () => {
      if (options.kakaoFails) throw new errors.ProviderError('kakao-local', 'search', 'temporary');
      return { results: options.kakaoEmpty ? [] : [{ placeName: '테스트 카페' }], totalCount: 1, pageableCount: 1, isEnd: true };
    } },
    '@/lib/api/naverLocal': { searchNaverLocal: async () => {
      naverCalls++;
      if (options.naverFails) throw new errors.ProviderError('naver-local', 'search', 'temporary');
      return options.naverEmpty ? [] : parseNaverLocal(body);
    } },
  });
  return { api, naverCalls: () => naverCalls };
}

test('카카오 성공은 추가 호출하지 않고 0건·실패에서만 네이버로 보완한다', async () => {
  const primary = externalFixture();
  assert.equal((await primary.api.searchExternalPlacesPage('테스트')).isEnd, true);
  assert.equal(primary.naverCalls(), 0);
  for (const options of [{ kakaoEmpty: true }, { kakaoFails: true }]) {
    const fallback = externalFixture(options);
    const page = await fallback.api.searchExternalPlacesPage('테스트');
    assert.equal(page.results.length, 1); assert.equal(page.isEnd, false);
    assert.equal(fallback.naverCalls(), 1);
    assert.deepEqual(Array.from(page.failedSources ?? []), options.kakaoFails ? ['kakao'] : []);
  }
  for (const options of [{ kakaoEmpty: true, naverFails: true }, { kakaoFails: true, naverEmpty: true }]) {
    await assert.rejects(externalFixture(options).api.searchExternalPlacesPage('테스트'));
  }
});

test('검색 출처는 결과 단위이며 저장된 네이버 URL도 인식한다', () => {
  const { api } = externalFixture();
  assert.equal(api.externalPlaceAttribution([{ source: 'naver' }]), '장소 정보 제공: 네이버');
  assert.equal(api.externalPlaceAttribution([{}, { placeUrl: 'https://map.naver.com/p/search/test' }]), '장소 정보 제공: 카카오 · 네이버');
  assert.deepEqual({ ...api.externalPlaceCounts([{}, { source: 'naver' }]) },
    { kakao_count: 1, naver_count: 1, external_count: 2 });
});

test('실패한 공급자를 정확히 구분하고 취소 후 보완 요청을 시작하지 않는다', async () => {
  for (const [options, sources] of [
    [{ kakaoEmpty: true, naverFails: true }, ['naver']],
    [{ kakaoFails: true, naverFails: true }, ['kakao', 'naver']],
    [{ kakaoFails: true, naverEmpty: true }, ['kakao']],
  ] as const) {
    await assert.rejects(externalFixture(options).api.searchExternalPlacesPage('테스트'), (error: any) => {
      assert.deepEqual(Array.from(error.failedSources), sources); return true;
    });
  }
  const controller = new AbortController(); controller.abort();
  let requests = 0;
  const api = loadModule<External>('lib/api/externalPlaces.ts', {
    '@/lib/providerErrors': errors,
    '@/lib/placeCatalogSuppression': loadModule('lib/placeCatalogSuppression.ts', {}),
    '@/lib/api/kakaoLocal': { searchKakaoLocalPage: async () => { throw new errors.ProviderError('kakao-local', 'search', 'cancelled'); } },
    '@/lib/api/naverLocal': { searchNaverLocal: async () => { requests++; return []; } },
  });
  await assert.rejects(api.searchExternalPlacesPage('테스트', undefined, { signal: controller.signal }));
  assert.equal(requests, 0);
});

test('비로그인 클라이언트 호출·게이트웨이 401·공급자 설정 오류·취소를 구분한다', async () => {
  for (const [status, payload, kind] of [[401, { message: 'JWT error' }, 'invalid_request'],
    [502, { kind: 'configuration' }, 'configuration'], [429, {}, 'rate_limited']] as const) {
    const localErrors = loadModule<typeof errors>('lib/providerErrors.ts', {});
    const api = loadModule<typeof import('../lib/api/naverLocal')>('lib/api/naverLocal.ts', {
      '@/lib/providerErrors': localErrors, '@/lib/region': region,
      '@/lib/api/generalPlaces': { findGeneralPlace: async () => null },
      '@/lib/supabase': { supabase: { functions: { invoke: async (_name: string, options: any) => {
        assert.equal(options.headers, undefined); // Authorization을 임의 주입하지 않고 SDK의 apikey 계약을 따른다.
        return { data: null, error: { name: 'FunctionsHttpError', context: Response.json(payload, { status }) } };
      } } } },
    }, { AbortController });
    await assert.rejects(api.searchNaverLocal('테스트'), (error: any) => error.kind === kind);
  }
  const localErrors = loadModule<typeof errors>('lib/providerErrors.ts', {});
  let calls = 0;
  const cancelled = loadModule<typeof import('../lib/api/naverLocal')>('lib/api/naverLocal.ts', {
    '@/lib/providerErrors': localErrors, '@/lib/region': region,
    '@/lib/api/generalPlaces': { findGeneralPlace: async () => null },
    '@/lib/supabase': { supabase: { functions: { invoke: async () => { calls++; return { data: null }; } } } },
  }, { AbortController });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(cancelled.searchNaverLocal('테스트', controller.signal), (error: any) => error.kind === 'cancelled');
  assert.equal(calls, 0);
});

test('클라이언트는 좌표 DTO만 받아 잘못된 ID/URL을 전달하지 않는다', async () => {
  const api = loadModule<typeof import('../lib/api/naverLocal')>('lib/api/naverLocal.ts', {
    '@/lib/providerErrors': errors, '@/lib/region': region,
    '@/lib/api/generalPlaces': { findGeneralPlace: async () => null },
    '@/lib/supabase': { supabase: { functions: { invoke: async () => ({ data: {
      results: [{ ...parseNaverLocal(body)[0], providerId: 'not-kakao', placeUrl: 'https://untrusted.test' }],
    }, error: null }) } } },
  }, { AbortController });
  const [result] = await api.searchNaverLocal('테스트');
  assert.equal(result.providerId, undefined); assert.match(result.placeUrl!, /^https:\/\/map\.naver\.com/);
});
