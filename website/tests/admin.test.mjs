import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { encodeSession } from '../src/admin/auth.js';
import { summarizeChecks } from '../src/admin/sources.js';
import worker from '../src/index.js';
import { endReasonsQuery, exceptionCountQuery, liveNavigationQuery } from '../../scripts/posthog-metrics.mjs';

const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const placeId = '11111111-1111-4111-8111-111111111111';
const canary = 'canary-secret-do-not-leak';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function baseEnv(adminFetch, extra = {}) {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    ADMIN_USER_IDS: adminId,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SECRET_KEY: canary,
    POSTHOG_API_KEY: canary,
    POSTHOG_PROJECT_ID: '123',
    GITHUB_ADMIN_READ_TOKEN: canary,
    ASC_KEY_ID: 'KEYID',
    ASC_ISSUER_ID: 'issuer',
    ASC_PRIVATE_KEY: canary,
    adminFetch,
    ...extra,
  };
}

test('도착률 쿼리는 reason=arrived 실주행이고 had_arrived로 바꾸지 않는다', () => {
  const reasons = endReasonsQuery();
  const live = liveNavigationQuery();
  assert.match(reasons, /properties\.reason/);
  assert.match(reasons, /properties\.mode = 'live'/);
  assert.match(reasons, /INTERVAL 7 DAY/);
  assert.doesNotMatch(reasons, /had_arrived/);
  assert.match(live, /navigation_started/);
  assert.match(live, /guide_session_id/);
  assert.match(exceptionCountQuery(), /\$exception/);
  assert.match(exceptionCountQuery(), /posthog-ios/);
  assert.equal(summarizeChecks([{ status: 'completed', conclusion: 'success' }]), 'success');
  assert.equal(summarizeChecks([{ status: 'in_progress', conclusion: null }]), 'running');
  assert.equal(summarizeChecks([{ status: 'completed', conclusion: 'failure' }]), 'failure');
  assert.equal(summarizeChecks([]), 'none');
});

test('allowlist가 비거나 잘못되면 화면 API를 막고 외부 호출을 하지 않는다', async () => {
  for (const ids of ['', '   ', 'not-a-uuid', `${adminId},nope`]) {
    let called = false;
    const response = await worker.fetch(new Request('https://motomap.kr/admin/api/dashboard'), baseEnv(async () => {
      called = true;
      throw new Error('upstream');
    }, { ADMIN_USER_IDS: ids }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).state, 'configuration_blocked');
    assert.equal(called, false);
  }
});

test('user_metadata의 admin 표시는 허용되지 않고 지표를 조회하지 않는다', async () => {
  const calls = [];
  const cookie = encodeSession({ access: 'access-token', refresh: 'refresh-token' });
  const response = await worker.fetch(new Request('https://motomap.kr/admin/api/dashboard', {
    headers: { cookie: `motomap_admin=${cookie}` },
  }), baseEnv(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/auth/v1/user')) {
      return jsonResponse({ id: otherId, user_metadata: { role: 'admin' } });
    }
    throw new Error(`unexpected ${url}`);
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).state, 'forbidden');
  assert.equal(calls.some((url) => url.includes('posthog.com')), false);
  assert.equal(JSON.stringify(calls).includes(canary), false);
});

test('허용된 관리자는 정의된 지표를 보고 비밀값을 응답에 담지 않는다', async () => {
  const cookie = encodeSession({ access: 'access-token', refresh: 'refresh-token' });
  const response = await worker.fetch(new Request('https://motomap.kr/admin/api/dashboard', {
    headers: { cookie: `motomap_admin=${cookie}` },
  }), baseEnv(async (url, init) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: adminId, user_metadata: { role: 'nope' } });
    if (href.includes('posthog.com')) {
      const query = JSON.parse(init.body).query.query;
      if (query.includes('person_id')) return jsonResponse({ results: [[4, 2]] });
      if (query.includes('navigation_started')) return jsonResponse({ results: [[2, 1]] });
      if (query.includes('properties.reason')) return jsonResponse({ results: [['arrived', 1], ['cancelled', 1]] });
      if (query.includes('properties.result')) return jsonResponse({ results: [['submitted', 1]] });
      if (query.includes('place_submission_opened')) return jsonResponse({ results: [[3, 2, 1]] });
      if (query.includes('$exception')) return jsonResponse({ results: [[0, 0, 0]] });
      return jsonResponse({ results: [] });
    }
    if (href.includes('/pulls?')) return jsonResponse([]);
    if (href.includes('appstoreconnect.apple.com')) return jsonResponse({ data: [] }, 500);
    if (href.includes('/rest/v1/')) return jsonResponse([]);
    throw new Error(`unexpected ${href}`);
  }, { ASC_PRIVATE_KEY: undefined, ASC_KEY_ID: undefined, ASC_ISSUER_ID: undefined }));
  assert.equal(response.status, 200);
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(canary), false);
  assert.equal(serialized.includes('user_metadata'), false);
  assert.equal(body.metrics.wau.current, 4);
  assert.equal(body.metrics.liveNavigation.current, 2);
  assert.equal(body.metrics.arrival.rate, 50);
  assert.equal(body.metrics.arrival.definition.includes('had_arrived로 바꾸지 않음'), true);
  assert.equal(body.metrics.funnel.rate, 50);
  assert.equal(body.metrics.funnel.opened, 3);
  assert.equal(body.metrics.exceptions.state, 'ok');
  assert.equal(body.metrics.exceptions.js, 0);
  assert.equal(body.metrics.exceptions.native, 0);
  assert.equal(body.progress.testflight.state, 'disconnected');
  assert.equal(body.queue.state, 'ok');
  assert.deepEqual(body.queue.items, []);
});

test('키 없음·조회 실패·0건은 서로 다른 상태다', async () => {
  const cookie = encodeSession({ access: 'access-token', refresh: 'refresh-token' });
  const disconnected = await worker.fetch(new Request('https://motomap.kr/admin/api/dashboard', {
    headers: { cookie: `motomap_admin=${cookie}` },
  }), baseEnv(async (url) => {
    if (String(url).includes('/auth/v1/user')) return jsonResponse({ id: adminId });
    throw new Error(`unexpected ${url}`);
  }, {
    POSTHOG_API_KEY: undefined,
    POSTHOG_PROJECT_ID: undefined,
    GITHUB_ADMIN_READ_TOKEN: undefined,
    SUPABASE_SECRET_KEY: undefined,
    ASC_PRIVATE_KEY: undefined,
    ASC_KEY_ID: undefined,
    ASC_ISSUER_ID: undefined,
  }));
  const disconnectedBody = await disconnected.json();
  assert.equal(disconnectedBody.metrics.wau.state, 'disconnected');
  assert.equal(disconnectedBody.metrics.exceptions.state, 'disconnected');
  assert.equal(disconnectedBody.progress.pulls.state, 'disconnected');
  assert.equal(disconnectedBody.progress.testflight.state, 'disconnected');
  assert.equal(disconnectedBody.queue.state, 'disconnected');

  const failed = await worker.fetch(new Request('https://motomap.kr/admin/api/dashboard', {
    headers: { cookie: `motomap_admin=${cookie}` },
  }), baseEnv(async (url) => {
    if (String(url).includes('/auth/v1/user')) return jsonResponse({ id: adminId });
    if (String(url).includes('posthog.com')) return jsonResponse({ error: 'no' }, 500);
    if (String(url).includes('/pulls?')) return jsonResponse([], 500);
    if (String(url).includes('/rest/v1/')) return jsonResponse([]);
    throw new Error(String(url));
  }, { ASC_PRIVATE_KEY: undefined, ASC_KEY_ID: undefined, ASC_ISSUER_ID: undefined }));
  const failedBody = await failed.json();
  assert.equal(failedBody.metrics.wau.state, 'error');
  assert.equal(failedBody.metrics.wau.current, undefined);
  assert.equal(failedBody.progress.pulls.state, 'error');
});

test('장소 승인만 확인 후 서버 처리자 id로 기록하고 다른 출처의 쓰기는 없다', async () => {
  const cookie = encodeSession({ access: 'access-token', refresh: 'refresh-token' });
  const calls = [];
  const env = baseEnv(async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    if (String(url).includes('/auth/v1/user')) return jsonResponse({ id: adminId });
    if (String(url).includes('/rpc/apply_admin_place_decision')) return jsonResponse({ result: 'approve' });
    throw new Error(String(url));
  }, { ASC_PRIVATE_KEY: undefined, ASC_KEY_ID: undefined, ASC_ISSUER_ID: undefined });
  const headers = {
    cookie: `motomap_admin=${cookie}`,
    origin: 'https://motomap.kr',
    'content-type': 'application/json',
  };
  const missingConfirm = await worker.fetch(new Request('https://motomap.kr/admin/api/places/decision', {
    method: 'POST',
    headers,
    body: JSON.stringify({ placeId, action: 'approve', acknowledgeNotification: false }),
  }), env);
  assert.equal(missingConfirm.status, 400);
  assert.equal(calls.some((call) => call.url.includes('/rpc/')), false);

  const crossSite = await worker.fetch(new Request('https://motomap.kr/admin/api/places/decision', {
    method: 'POST',
    headers: { ...headers, origin: 'https://evil.example' },
    body: JSON.stringify({ placeId, action: 'approve', acknowledgeNotification: true }),
  }), env);
  assert.equal(crossSite.status, 403);
  assert.equal(calls.some((call) => call.url.includes('/rpc/')), false);

  const approved = await worker.fetch(new Request('https://motomap.kr/admin/api/places/decision', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      placeId,
      action: 'approve',
      acknowledgeNotification: true,
      p_actor: otherId,
    }),
  }), env);
  assert.equal(approved.status, 200);
  const rpc = calls.find((call) => call.url.includes('/rpc/apply_admin_place_decision'));
  assert.equal(JSON.parse(rpc.body).p_actor, adminId);
  assert.equal(JSON.stringify(rpc).includes(canary), false);

  const readAttempt = await worker.fetch(new Request('https://motomap.kr/admin/api/places/decision', {
    headers: { cookie: headers.cookie },
  }), env);
  assert.equal(readAttempt.status, 405);
  const otherWrite = await worker.fetch(new Request('https://motomap.kr/admin/api/courses/decision', {
    method: 'POST',
    headers,
    body: JSON.stringify({ acknowledgeNotification: true }),
  }), env);
  assert.equal(otherWrite.status, 404);
});

test('로그인 쿠키는 HttpOnly이고 본문에 토큰을 넣지 않는다', async () => {
  const response = await worker.fetch(new Request('https://motomap.kr/admin/api/session/verify', {
    method: 'POST',
    headers: { origin: 'https://motomap.kr', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', token: '123456' }),
  }), baseEnv(async (url) => {
    if (String(url).includes('/auth/v1/verify')) {
      return jsonResponse({ access_token: 'access-token', refresh_token: 'refresh-token', user: { user_metadata: { role: 'admin' } } });
    }
    if (String(url).includes('/auth/v1/user')) return jsonResponse({ id: adminId });
    throw new Error(String(url));
  }, {
    SUPABASE_SECRET_KEY: undefined,
    POSTHOG_API_KEY: undefined,
    POSTHOG_PROJECT_ID: undefined,
    GITHUB_ADMIN_READ_TOKEN: undefined,
    ASC_PRIVATE_KEY: undefined,
    ASC_KEY_ID: undefined,
    ASC_ISSUER_ID: undefined,
  }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\/admin/);
  assert.equal(JSON.stringify(await response.json()).includes('access-token'), false);
});

test('관리자 껍데기는 예시 수치와 인라인 스크립트가 없다', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');
  assert.equal(html.includes('1,234'), false);
  assert.equal(html.includes('<script'), true);
  assert.equal(html.includes('src="/admin.js"'), true);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
  assert.match(script, /제보자에게 알림·푸시/);
  const response = await worker.fetch(new Request('https://motomap.kr/admin'), {
    ASSETS: { fetch: async () => new Response(html) },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), html);
  const asset = await worker.fetch(new Request('https://motomap.kr/admin.css'), {
    ASSETS: { fetch: async () => new Response('asset') },
  });
  assert.equal(await asset.text(), 'asset');
});
