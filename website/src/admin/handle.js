import { securityHeaders } from '../securityHeaders.js';
import {
  clearedSessionCookie,
  encodeSession,
  fetchAuthUser,
  isAllowlisted,
  isSameOriginPost,
  isUuid,
  parseAdminAllowlist,
  readSession,
  refreshAuthSession,
  requestEmailCode,
  sessionCookie,
  verifyEmailCode,
} from './auth.js';
import { adminFetch, callRpc, loadManual, loadMetrics, loadPulls, loadQueue, loadTestflight } from './sources.js';

const noStore = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  ...securityHeaders,
};

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...noStore, ...headers },
  });
}

function configured(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function authConfig(env) {
  const allowlist = parseAdminAllowlist(env.ADMIN_USER_IDS);
  if (!allowlist.valid || !configured(env.SUPABASE_URL) || !configured(env.SUPABASE_ANON_KEY)) {
    return { blocked: true, allowlist };
  }
  return { blocked: false, allowlist, url: env.SUPABASE_URL.trim(), anonKey: env.SUPABASE_ANON_KEY.trim() };
}

async function resolveActor(request, env, fetchImpl) {
  const config = authConfig(env);
  if (config.blocked) return { state: 'configuration_blocked' };
  const session = readSession(request);
  if (!session) return { state: 'unauthenticated' };
  let user = await fetchAuthUser({
    url: config.url, anonKey: config.anonKey, accessToken: session.access, fetchImpl,
  });
  let refreshed = null;
  if (!user.ok && user.status === 401) {
    refreshed = await refreshAuthSession({
      url: config.url, anonKey: config.anonKey, refreshToken: session.refresh, fetchImpl,
    });
    if (!refreshed.ok) return { state: 'unauthenticated' };
    user = await fetchAuthUser({
      url: config.url, anonKey: config.anonKey, accessToken: refreshed.access, fetchImpl,
    });
  }
  if (!user.ok || !user.id) return { state: 'unauthenticated' };
  if (!isAllowlisted(config.allowlist, user.id)) return { state: 'forbidden' };
  return { state: 'ok', id: user.id, refreshed, secure: new URL(request.url).protocol === 'https:' };
}

function cookieHeader(actor) {
  if (!actor.refreshed) return {};
  const value = encodeSession(actor.refreshed);
  if (!value) return {};
  return { 'Set-Cookie': sessionCookie(value, actor.secure) };
}

async function shell(request, env) {
  const assetUrl = new URL('/admin.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl));
  const html = await asset.text();
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStore },
  });
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const fetchImpl = adminFetch(env);

  if (path === '/admin' && request.method === 'GET') return shell(request, env);
  if (path === '/admin' && request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...noStore } });
  }
  if (!path.startsWith('/admin/api/')) return json(404, { state: 'not_found' });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST', ...noStore } });
  }
  if (request.method === 'POST' && !isSameOriginPost(request)) return json(403, { state: 'origin_rejected' });

  if (path === '/admin/api/session/logout' && request.method === 'POST') {
    const secure = url.protocol === 'https:';
    return json(200, { state: 'signed_out' }, { 'Set-Cookie': clearedSessionCookie(secure) });
  }

  const config = authConfig(env);
  if (path === '/admin/api/session/otp' || path === '/admin/api/session/verify') {
    if (request.method !== 'POST') return json(405, { state: 'method_not_allowed' });
    if (config.blocked) return json(403, { state: 'configuration_blocked' });
    const body = await readJson(request);
    if (!validEmail(body?.email)) return json(400, { state: 'invalid_input' });
    if (path.endsWith('/otp')) {
      const sent = await requestEmailCode({
        url: config.url, anonKey: config.anonKey, email: body.email, fetchImpl,
      });
      return json(sent ? 200 : 502, { state: sent ? 'code_sent' : 'unavailable' });
    }
    if (typeof body.token !== 'string' || !/^\d{6,10}$/.test(body.token)) return json(400, { state: 'invalid_input' });
    const verified = await verifyEmailCode({
      url: config.url, anonKey: config.anonKey, email: body.email, token: body.token, fetchImpl,
    });
    if (!verified.ok) return json(401, { state: 'unauthenticated' });
    const user = await fetchAuthUser({
      url: config.url, anonKey: config.anonKey, accessToken: verified.access, fetchImpl,
    });
    if (!user.ok || !isAllowlisted(config.allowlist, user.id)) return json(403, { state: 'forbidden' });
    const cookie = encodeSession(verified);
    if (!cookie) return json(500, { state: 'error' });
    return json(200, { state: 'signed_in' }, {
      'Set-Cookie': sessionCookie(cookie, url.protocol === 'https:'),
    });
  }

  const actor = await resolveActor(request, env, fetchImpl);
  if (actor.state !== 'ok') return json(actor.state === 'unauthenticated' ? 401 : 403, { state: actor.state });

  if (path === '/admin/api/dashboard' && request.method === 'GET') {
    const [metrics, pulls, testflight, manual, queue] = await Promise.all([
      loadMetrics(env, fetchImpl),
      loadPulls(env, fetchImpl),
      loadTestflight(env, fetchImpl),
      loadManual(env, fetchImpl),
      loadQueue(env, fetchImpl),
    ]);
    const passed = (manual.qa ?? []).filter((item) => item.status === 'pass').length;
    return json(200, {
      windowLabel: metrics.windowLabel,
      metrics,
      progress: {
        weeklyCut: { state: manual.state, items: manual.weeklyCut ?? [] },
        pulls,
        testflight,
        qa: {
          state: manual.state,
          passed,
          total: (manual.qa ?? []).length,
          items: manual.qa ?? [],
        },
      },
      queue,
    }, cookieHeader(actor));
  }

  if (request.method !== 'POST') return json(405, { state: 'method_not_allowed' });
  const body = await readJson(request);

  if (path === '/admin/api/places/decision') {
    if (body?.acknowledgeNotification !== true) return json(400, { state: 'confirmation_required' });
    if (!isUuid(body.placeId) || (body.action !== 'approve' && body.action !== 'reject')) {
      return json(400, { state: 'invalid_input' });
    }
    const result = await callRpc(env, 'apply_admin_place_decision', {
      p_place_id: body.placeId,
      p_action: body.action,
      p_actor: actor.id,
    }, fetchImpl);
    if (result.state !== 'ok') return json(result.state === 'migration_missing' ? 503 : 502, { state: result.state });
    return json(200, { state: 'ok', result: result.body.result ?? 'error' }, cookieHeader(actor));
  }

  if (path === '/admin/api/manual') {
    const remove = body?.remove === true;
    const kind = body?.kind;
    if (kind !== 'weekly_cut' && kind !== 'qa') return json(400, { state: 'invalid_input' });
    if (remove && !isUuid(body.id)) return json(400, { state: 'invalid_input' });
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const status = body?.status;
    const allowed = kind === 'weekly_cut' ? ['done', 'doing', 'waiting'] : ['pass', 'fail', 'waiting'];
    if (!remove && (title.length < 1 || title.length > 200 || !allowed.includes(status))) {
      return json(400, { state: 'invalid_input' });
    }
    const result = await callRpc(env, 'save_admin_manual_item', {
      p_actor: actor.id,
      p_id: isUuid(body?.id) ? body.id : null,
      p_kind: kind,
      p_title: title,
      p_status: status ?? '',
      p_remove: remove,
    }, fetchImpl);
    if (result.state !== 'ok') return json(result.state === 'migration_missing' ? 503 : 502, { state: result.state });
    return json(200, { state: 'ok', result: result.body.result ?? 'error', id: result.body.id ?? null }, cookieHeader(actor));
  }

  if (path === '/admin/api/recommendation') {
    const kinds = ['place', 'course', 'riding_guide', 'feedback', 'place_change'];
    if (!kinds.includes(body?.targetKind) || !isUuid(body?.targetId)) return json(400, { state: 'invalid_input' });
    const clear = body.clear === true;
    const recommendation = typeof body.body === 'string' ? body.body.trim() : '';
    if (!clear && (recommendation.length < 1 || recommendation.length > 500)) return json(400, { state: 'invalid_input' });
    const result = await callRpc(env, 'save_admin_pm_recommendation', {
      p_actor: actor.id,
      p_target_kind: body.targetKind,
      p_target_id: body.targetId,
      p_body: recommendation,
      p_clear: clear,
    }, fetchImpl);
    if (result.state !== 'ok') return json(result.state === 'migration_missing' ? 503 : 502, { state: result.state });
    return json(200, { state: 'ok', result: result.body.result ?? 'error' }, cookieHeader(actor));
  }

  return json(404, { state: 'not_found' });
}
