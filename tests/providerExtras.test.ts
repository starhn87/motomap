import assert from 'node:assert/strict';
import test from 'node:test';
import { FunctionsClient } from '@supabase/functions-js';
import * as providerErrors from '../lib/providerErrors';
import * as distance from '../lib/distance';
import { loadModule } from './helpers/loadModule';
import { allowedLocationPrivacy } from './helpers/allowedLocationPrivacy';
import type * as Gas from '../lib/api/gasStations';
import type * as Weather from '../lib/api/weather';
import type { GasSearchSpec } from '../hooks/useGasStations';

type QueryOptions = {
  queryFn: () => Promise<unknown>;
  retry: (failureCount: number, error: unknown) => boolean;
  placeholderData?: (previous: unknown) => unknown;
};

const station = { id: 'fixture', name: '테스트 주유소', brand: 'SK에너지', price: 1800, distance: 10, latitude: 37.5, longitude: 127, isSelf: false };
const detail = { id: 'fixture', name: '테스트 주유소', brand: 'SK에너지', address: '공개 테스트 주소', tel: '', isSelf: false, carWash: false, convenience: false, repair: false, prices: [{ prod: 'B027', price: 1800, tradeAt: '' }] };
const hour = { date: '20261011', time: '1200', tmp: 20, pop: 10, pty: 0, sky: 1, wsd: 2, reh: 60 };

function fixture(body: unknown, options: { status?: number; hangs?: boolean; text?: boolean } = {}) {
  const calls: { name: string; timeout: number }[] = [];
  const client = new FunctionsClient('https://provider-test.invalid', {
    // 실제 functions-js의 HTTP 오류·JSON 처리·AbortController를 실행하되 네트워크는 대역이다.
    customFetch: async (_input, init) => {
      if (options.hangs) return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('fixture timeout', 'AbortError')), { once: true });
      });
      return new Response(options.text ? 'malformed-json' : JSON.stringify(body), {
        status: options.status ?? 200, headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const supabase = { functions: { invoke: (name: string, args: { body?: Record<string, unknown>; timeout: number }) => {
    calls.push({ name, timeout: args.timeout });
    // 앱의 제한 시간 옵션을 확인하면서 테스트에서는 20ms로 축약한다.
    return client.invoke(name, { ...args, timeout: options.hangs ? 20 : args.timeout });
  } } };
  const gas = loadModule<typeof Gas>('lib/api/gasStations.ts', {
    '@/lib/supabase': { supabase }, '@/lib/distance': distance, '@/lib/providerErrors': providerErrors,
    '@/stores/useLocationPrivacyStore': allowedLocationPrivacy,
  });
  const weather = loadModule<typeof Weather>('lib/api/weather.ts', {
    '@/lib/supabase': { supabase }, '@/lib/api/kakaoLocal': { coordToRegion: async () => null },
    '@/lib/sun': { isNightAt: () => false }, '@/constants/weather': { NIGHT_PARTLY_CLOUDY_EMOJI: 'night-cloud' },
    '@/lib/providerErrors': providerErrors,
    '@/stores/useLocationPrivacyStore': allowedLocationPrivacy,
  });
  return { gas, weather, calls };
}

test('주유소의 정상 0건과 비정상 JSON/좌표 응답은 구분한다', async () => {
  const empty = fixture({ stations: [] });
  assert.equal((await empty.gas.fetchNearbyGasStations({ latitude: 37.5, longitude: 127 })).length, 0);
  for (const body of [null, {}, { stations: null }, { stations: [{ ...station, latitude: null }] }, { stations: [{ ...station, price: '1800' }] }]) {
    const api = fixture(body);
    await assert.rejects(api.gas.fetchNearbyGasStations({ latitude: 37.5, longitude: 127 }), (error: unknown) =>
      error instanceof providerErrors.ProviderError && error.kind === 'invalid_response');
  }
  const malformed = fixture(null, { text: true });
  await assert.rejects(malformed.gas.fetchNearbyGasStations({ latitude: 37.5, longitude: 127 }));
});

test('정상 주유소·일반 POI 유가 매칭과 이륜차 휴게소 제외는 유지한다', async () => {
  const api = fixture({ stations: [station, { ...station, id: 'excluded', brand: 'ex알뜰' }] });
  assert.equal((await api.gas.fetchNearbyGasStations({ latitude: 37.5, longitude: 127 })).length, 1);
  assert.equal(api.calls[0].timeout, 15000);
  assert.equal(api.gas.looksLikeGasStation('SK 엔크린'), true);
  assert.equal(api.gas.looksLikeGasStation('GS칼텍스 LPG'), false);
  const notFound = fixture({ stations: [] });
  assert.equal(await notFound.gas.fetchGasPricesAt({ name: '테스트 주유소', latitude: 37.5, longitude: 127 }), null);
});

test('주유소 상세의 정상 가격·가격 0건과 잘못된 응답을 구분한다', async () => {
  assert.equal((await fixture(detail).gas.fetchGasStationDetail('fixture')).prices[0].price, 1800);
  assert.equal((await fixture({ ...detail, prices: [] }).gas.fetchGasStationDetail('fixture')).prices.length, 0);
  for (const body of [{}, { ...detail, prices: null }, { ...detail, prices: [{ ...detail.prices[0], price: null }] }]) {
    await assert.rejects(fixture(body).gas.fetchGasStationDetail('fixture'), (error: unknown) =>
      error instanceof providerErrors.ProviderError && error.kind === 'invalid_response');
  }
});

test('Edge HTTP 오류는 원문 없이 분류하고 JWT 인증 실패로 공급자를 영구 차단하지 않는다', async () => {
  for (const [status, kind] of [[401, 'invalid_request'], [403, 'invalid_request'], [429, 'rate_limited'], [503, 'temporary']] as const) {
    const api = fixture({ error: 'secret-key-and-point' }, { status });
    await assert.rejects(api.gas.fetchGasStationDetail('fixture'), (error: unknown) => {
      assert.ok(error instanceof providerErrors.ProviderError);
      assert.equal(error.kind, kind);
      assert.equal(error.status, status);
      assert.equal(error.message.includes('secret'), false);
      assert.equal(providerErrors.retryProviderQuery(0, error), status === 503);
      assert.equal(providerErrors.retryProviderQuery(1, error), false);
      return true;
    });
  }
});

test('실제 FunctionsClient의 유가·날씨 타임아웃이 요청을 중지하고 안전한 오류로 끝난다', async () => {
  const api = fixture(null, { hangs: true });
  await assert.rejects(api.gas.fetchGasStationDetail('fixture'), (error: unknown) =>
    error instanceof providerErrors.ProviderError && error.kind === 'timeout');
  await assert.rejects(api.weather.fetchRidingWeather(37.5, 127), (error: unknown) =>
    error instanceof providerErrors.ProviderError && error.kind === 'timeout');
  assert.deepEqual(api.calls.map(call => call.timeout), [15000, 20000]);
});

test('기상청 정상 응답은 기존 점수·시간별 예보를 유지한다', async () => {
  const api = fixture({ hours: [hour, { ...hour, time: '1300' }] });
  const data = await api.weather.fetchRidingWeather(37.5, 127);
  assert.equal(data.current.temp, 20);
  assert.equal(data.hourly.length, 2);
  assert.equal(Number.isFinite(data.score), true);
  assert.equal(api.calls[0].timeout, 20000);
});

test('날씨 결측·잘못된 날짜·숫자를 0도나 정상 예보로 보여주지 않는다', async () => {
  for (const body of [{}, { hours: [] }, { hours: 'invalid' }, { hours: [{ ...hour, tmp: null }] }, { hours: [{ ...hour, date: '20260231' }] }, { hours: [{ ...hour, pop: 150 }] }]) {
    await assert.rejects(fixture(body).weather.fetchRidingWeather(37.5, 127), (error: unknown) =>
      error instanceof providerErrors.ProviderError && error.kind === 'invalid_response');
  }
});

test('날씨 Edge 오류 원문을 사용자·진단 오류에 포함하지 않는다', async () => {
  const api = fixture({ error: 'private-key-and-location' }, { status: 502 });
  await assert.rejects(api.weather.fetchRidingWeather(37.5, 127), (error: unknown) => {
    assert.ok(error instanceof providerErrors.ProviderError);
    assert.equal(error.kind, 'temporary');
    assert.equal(JSON.stringify(error).includes('private'), false);
    return true;
  });
});

test('미래 예보의 정상 기온 결측은 현재 날씨를 유지하고 결측 슬롯을 0도로 표시하지 않는다', async () => {
  const normal = await fixture({ hours: [hour, { ...hour, time: '1300' }] }).weather.fetchRidingWeather(37.5, 127);
  const futureMissing = await fixture({ hours: [hour, { ...hour, time: '1300', tmp: null, pop: 90, pty: 1 }] }).weather.fetchRidingWeather(37.5, 127);
  assert.equal(futureMissing.current.temp, 20);
  assert.equal(futureMissing.hourly.length, 1);
  assert.ok(futureMissing.score < normal.score);
  const laterMissing = await fixture({ hours: Array.from({ length: 24 }, (_, i) => ({ ...hour, time: `${String(i).padStart(2, '0')}00`, tmp: i >= 12 ? null : 20 })) }).weather.fetchRidingWeather(37.5, 127);
  assert.equal(laterMissing.hourly.length, 12);
});

function gasQuery(fetchNearbyGasStations: () => Promise<Gas.GasStation[]>) {
  const hooks = loadModule<{ useGasStations: (spec: GasSearchSpec, enabled: boolean) => QueryOptions }>('hooks/useGasStations.ts', {
    '@tanstack/react-query': { useQuery: (options: QueryOptions) => options },
    '@/lib/distance': distance, '@/lib/providerErrors': providerErrors,
    '@/lib/api/gasStations': { fetchNearbyGasStations },
  });
  return hooks.useGasStations({ latitude: 37.5, longitude: 127, zoom: 8, widthDp: 400, heightDp: 800 }, true);
}

test('유가 전체 실패에서 원래 오류 분류를 유지해 비정상 응답을 자동 재시도하지 않는다', async () => {
  const failure = new providerErrors.ProviderError('opinet', 'nearby', 'invalid_response');
  const query = gasQuery(async () => { throw failure; });
  await assert.rejects(query.queryFn(), (error: unknown) => error === failure);
  assert.equal(query.retry(0, failure), false);
});

test('유가 일부 타일 실패는 성공한 결과와 이전 캐시를 유지한다', async () => {
  let calls = 0;
  const query = gasQuery(async () => {
    if (++calls === 1) return [station];
    throw new providerErrors.ProviderError('opinet', 'nearby', 'temporary');
  });
  const results = await query.queryFn() as Gas.GasStation[];
  assert.ok(calls > 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, station.id);
  const previous = [station];
  assert.equal(query.placeholderData?.(previous), previous);
});

test('날씨 재조회는 기존 캐시를 유지하고 비정상 응답·429는 자동 반복하지 않는다', () => {
  const hooks = loadModule<{ useWeather: (lat: number, lng: number) => QueryOptions }>('hooks/useWeather.ts', {
    react: { useEffect() {} },
    '@tanstack/react-query': { useQuery: (options: QueryOptions) => options, useQueryClient: () => ({}) },
    '@/lib/api/weather': {}, '@/lib/api/air': {}, '@/lib/providerErrors': providerErrors,
  });
  const query = hooks.useWeather(37.5, 127);
  const previous = { current: { temp: 20 } };
  assert.equal(query.placeholderData?.(previous), previous);
  assert.equal(query.retry(0, new providerErrors.ProviderError('kma', 'forecast', 'invalid_response')), false);
  assert.equal(query.retry(0, new providerErrors.ProviderError('kma', 'forecast', 'rate_limited')), false);
  assert.equal(query.retry(0, new providerErrors.ProviderError('kma', 'forecast', 'timeout')), true);
  assert.equal(query.retry(1, new providerErrors.ProviderError('kma', 'forecast', 'timeout')), false);
});
