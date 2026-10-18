import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const place = {
  id: 'place-id', name: '테스트카페', category: 'cafe', address: '경기 가상시 중앙로 1',
  phone: '031-111-2222', latitude: 37.5, longitude: 127.1,
  source_provider: 'kakao', source_place_id: 'kakao-id', is_curation_protected: false,
};
const kakao = {
  id: 'kakao-id', place_name: place.name, category_name: '음식점 > 카페', category_group_code: 'CE7',
  phone: place.phone, address_name: place.address, road_address_name: place.address,
  x: '127.1', y: '37.5', place_url: 'https://place.map.kakao.com/kakao-id', distance: '0',
};
function naverRow(overrides: Record<string, unknown> = {}) {
  return { title: place.name, address: place.address, roadAddress: place.address,
    telephone: place.phone, mapx: '1271000000', mapy: '375000000', ...overrides };
}
function fixture(options: {
  kakao?: Record<string, unknown>[]; naver?: Record<string, unknown>[]; status?: number;
  invalidNaver?: boolean; hangs?: boolean; missingKey?: boolean; batchCount?: number; clock?: number[]; address?: string;
} = {}) {
  const calls: { url: string; body: any; headers: Headers }[] = [];
  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers) });
    if (url.startsWith('https://naverapihub.')) {
      if (options.hangs) return await new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('abort')), { once: true });
      });
      return Response.json(options.invalidNaver ? { upstream_secret: 'MUST_NOT_LEAK' }
        : { total: options.naver?.length ?? 1, items: options.naver ?? [naverRow()] }, { status: options.status ?? 200 });
    }
    if (url.startsWith('https://dapi.kakao.com')) {
      const docs = options.kakao ?? [kakao];
      return Response.json({ documents: docs, meta: { total_count: docs.length, pageable_count: docs.length, is_end: true } });
    }
    if (/rpc\/(get|claim)_place_change_monitor_batch$/.test(url)) return Response.json(Array.from({ length: options.batchCount ?? 1 }, (_, i) => ({ ...place, address: options.address ?? place.address, id: `place-${i}` })));
    if (url.endsWith('rpc/enqueue_place_change_review_v2')) return Response.json([{ review_id: 'review-id', should_report: true }]);
    if (url.includes('discord.com/api/')) return Response.json({ id: 'message-id' });
    if (url.includes('place_change_monitor_state') || url.endsWith('rpc/mark_place_change_review_reported')) return Response.json(null);
    throw new Error('Unexpected request: ' + url);
  };
  const naverParser = loadModule<any>('supabase/functions/_shared/naverLocalSearch.ts', {});
  const lookup = loadModule<any>('supabase/functions/_shared/placeChangeNaver.ts', {
    './naverLocalSearch.ts': naverParser,
  }, { URL, AbortController, setTimeout: (fn: () => void) => setTimeout(fn, 20) });
  const fingerprint = loadModule<any>('supabase/functions/_shared/placeChangeFingerprint.ts', {}, { crypto: webcrypto, TextEncoder });
  let handler: (req: Request) => Promise<Response> = () => { throw new Error('No handler'); };
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    KAKAO_REST_API_KEY: 'test-kakao', PLACE_CHANGE_MONITOR_SECRET: 'test-monitor',
    NAVER_LOCAL_SEARCH_CLIENT_ID: options.missingKey ? '' : 'test-naver-id',
    NAVER_LOCAL_SEARCH_CLIENT_SECRET: 'test-naver-secret', DISCORD_BOT_TOKEN: 'test-discord', DISCORD_CHANNEL_ID: 'channel',
  };
  loadModule('supabase/functions/place-change-monitor/index.ts', {
    '../_shared/placeChangeNaver.ts': lookup,
    '../_shared/placeChangeFingerprint.ts': fingerprint,
  }, { Deno: { env: { get: (name: string) => env[name] }, serve: (fn: typeof handler) => { handler = fn; } },
    fetch: fakeFetch, Response, URLSearchParams, AbortSignal, console,
    Date: options.clock ? class extends Date { static now() { return options.clock!.shift() ?? 31000; } } : Date });
  return {
    calls,
    run: async (dryRun = true) => {
      const response = await handler(new Request('https://example.test', { method: 'POST',
        headers: { 'x-place-change-secret': 'test-monitor' }, body: JSON.stringify({ limit: 1, dryRun }) }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test('카카오 정상일 때도 네이버 이름·주소 두 검색을 실행하며 dry-run은 쓰기·보고를 하지 않는다', async () => {
  const f = fixture();
  const { body } = await f.run();
  assert.equal(body.clean, 1);
  const lookups = f.calls.filter((c) => c.url.startsWith('https://naverapihub.'));
  assert.equal(lookups.length, 2);
  for (const call of lookups) {
    assert.equal(new URL(call.url).searchParams.get('display'), '5');
    assert.equal(call.headers.get('X-NCP-APIGW-API-KEY'), 'test-naver-secret');
  }
  assert.equal(f.calls.filter((c) => /enqueue|monitor_state|discord/.test(c.url)).length, 0);
});

test('카카오 not_found라도 네이버가 현재 이름·주소를 확인하면 불필요한 변경 검토를 만들지 않는다', async () => {
  const f = fixture({ kakao: [] });
  const { body } = await f.run(false);
  assert.equal(body.clean, 1);
  assert.equal(body.results[0].crossCheck, 'current_supported');
  assert.equal(f.calls.some((c) => /enqueue|discord/.test(c.url)), false);
});

test('양쪽 정상 0건은 폐업 확정 없이 낮은 신뢰도 검토로만 보고한다', async () => {
  const f = fixture({ kakao: [], naver: [] });
  const { body } = await f.run(false);
  assert.equal(body.changes, 1);
  const proposal = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  assert.equal(proposal.p_confidence, 'low');
  assert.deepEqual(proposal.p_change_types, ['not_found']);
  assert.deepEqual(proposal.p_proposed_changes, {});
  assert.equal(proposal.p_evidence.naver_cross_check.status, 'no_results');
});

test('네이버 인증·한도·응답·timeout 실패를 카카오 단독 정상/검색 부재로 바꾸지 않는다', async () => {
  for (const options of [{ status: 401 }, { status: 429 }, { invalidNaver: true }, { hangs: true }]) {
    const f = fixture(options);
    const { body } = await f.run(false);
    assert.equal(body.errors, 1);
    assert.equal(body.clean, 0);
    assert.equal(f.calls.some((c) => /enqueue|discord/.test(c.url)), false);
    const state = f.calls.find((c) => c.url.includes('place_change_monitor_state'))!.body;
    assert.equal(state.last_result, 'error');
    assert.equal(JSON.stringify(body).includes('MUST_NOT_LEAK'), false);
  }
  const missing = fixture({ missingKey: true });
  assert.equal((await missing.run()).status, 500);
  assert.equal(missing.calls.length, 0, '설정 누락은 선점·공급자 요청 전에 막는다');
});

test('네이버가 기존 번호를 지지하거나 전화 미제공이면 카카오 전화 변경 승인안을 차단한다', async () => {
  for (const row of [naverRow(), naverRow({ telephone: '' })]) {
    const f = fixture({ kakao: [{ ...kakao, phone: '031-333-4444' }], naver: [row] });
    const { body } = await f.run(false);
    assert.equal(body.changes, 1);
    const review = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
    assert.deepEqual(review.p_proposed_changes, {});
    const message = f.calls.find((c) => c.url.includes('discord.com/api/'))!.body;
    assert.match(message.content, /네이버 교차검증/);
    assert.equal(message.components[0].components.some((b: any) => b.custom_id.startsWith('placechange:apply')), false);
  }
});

test('고신뢰 카카오 변경값을 네이버도 확인한 경우에만 기존 승인안을 유지한다', async () => {
  const newAddress = '경기 가상시 중앙로 2';
  const f = fixture({ kakao: [{ ...kakao, road_address_name: newAddress }], naver: [naverRow({ roadAddress: newAddress })] });
  const { body } = await f.run(false);
  assert.equal(body.changes, 1);
  const review = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  assert.equal(review.p_proposed_changes.address, newAddress);
  assert.equal(review.p_evidence.naver_cross_check.status, 'observed_supported');
  assert.equal(review.p_source_provider, 'kakao', '네이버 결과를 카카오 식별자로 저장하지 않는다');
});

test('같은 주소의 다른 시설 이름이나 같은 이름의 먼 장소는 현재 장소 확인으로 쓰지 않는다', async () => {
  for (const row of [naverRow({ title: '테스트카페박물관' }), naverRow({ mapy: '385000000' })]) {
    const f = fixture({ naver: [row] });
    const { body } = await f.run();
    assert.equal(body.clean, 0);
    assert.equal(body.errors, 1);
  }
});

test('네이버 근거가 바뀌어 승인안이 차단되면 같은 주에도 이전 지문을 재사용하지 않는다', async () => {
  const get = async (phone: string) => {
    const f = fixture({ kakao: [{ ...kakao, phone: '031-333-4444' }], naver: [naverRow({ telephone: phone })] });
    await f.run(false);
    return f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  };
  const agreed = await get('031-333-4444');
  const conflict = await get(place.phone);
  assert.equal(agreed.p_proposed_changes.phone, '031-333-4444');
  assert.deepEqual(conflict.p_proposed_changes, {});
  assert.notEqual(agreed.p_fingerprint, conflict.p_fingerprint);
  assert.equal((await get(place.phone)).p_fingerprint, conflict.p_fingerprint, '조회 시각만 바뀌면 지문은 유지한다');
});


test('느린 배치에서는 예산 이후 추가 장소의 공급자 호출을 시작하지 않고 미처리 수를 반환한다', async () => {
  const f = fixture({ batchCount: 2, clock: [0, 0, 31000] });
  const { body } = await f.run();
  assert.equal(body.checked, 1);
  assert.equal(body.deferred, 1);
  assert.equal(f.calls.filter((c) => c.url.startsWith('https://naverapihub.')).length, 2);
});

test('주소 변경에 동의해도 네이버가 서로 다른 전화번호를 제공하면 승인안을 만들지 않는다', async () => {
  const newAddress = '경기 가상시 중앙로 2';
  const f = fixture({ kakao: [{ ...kakao, road_address_name: newAddress }],
    naver: [naverRow({ roadAddress: newAddress, telephone: '031-999-8888' })] });
  await f.run(false);
  const review = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  assert.deepEqual(review.p_proposed_changes, {});
});

test('같은 이름이어도 도로명 건물번호 1과 10을 같은 주소로 판정하지 않는다', async () => {
  const otherAddress = '경기도 가상시 중앙로 10';
  const f = fixture({ kakao: [], naver: [naverRow({ address: otherAddress, roadAddress: otherAddress })] });
  const { body } = await f.run(false);
  assert.equal(body.clean, 0);
  assert.equal(body.changes, 1);
  const review = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  assert.equal(review.p_evidence.naver_cross_check.matches_current, 0);
});

test('같은 주소의 현재 시설과 다른 이름의 관찰 시설이 각각 확인되면 상호·전화 변경을 차단한다', async () => {
  const renamed = { ...kakao, place_name: '테스트카페박물관', phone: '031-333-4444' };
  const f = fixture({ kakao: [renamed], naver: [naverRow(), naverRow({ title: renamed.place_name, telephone: renamed.phone })] });
  await f.run(false);
  const review = f.calls.find((c) => c.url.endsWith('rpc/enqueue_place_change_review_v2'))!.body;
  assert.equal(review.p_evidence.naver_cross_check.matches_current, 1);
  assert.equal(review.p_evidence.naver_cross_check.matches_observed, 1);
  assert.deepEqual(review.p_proposed_changes, {});
});


test('도로명 건물번호의 하이픈을 삭제해 11과 1-1을 같은 주소로 만들지 않는다', async () => {
  const otherAddress = '경기도 가상시 중앙로 1-1';
  const f = fixture({ address: '경기 가상시 중앙로 11', kakao: [],
    naver: [naverRow({ address: otherAddress, roadAddress: otherAddress })] });
  const { body } = await f.run();
  assert.equal(body.clean, 0);
  assert.equal(body.changes, 1);
});
