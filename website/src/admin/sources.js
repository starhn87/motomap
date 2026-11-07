import {
  wauQuery,
  liveNavigationQuery,
  endReasonsQuery,
  submissionAttemptsQuery,
  submissionFunnelQuery,
  exceptionCountQuery,
  delta,
  kstDay,
} from '../../../scripts/posthog-metrics.mjs';

export const GITHUB_REPO = 'starhn87/motomap';
export const APP_STORE_APP_ID = '6773636183';
const POSTHOG_HOSTS = new Set(['https://eu.posthog.com', 'https://us.posthog.com']);
const RESULT_LABELS = {
  login: '로그인 벽',
  missing_name: '장소명 없음',
  missing_category: '카테고리 없음',
  missing_address: '주소 없음',
  duplicate_approved: '이미 등록',
  duplicate_pending: '검토 중 중복',
  error: '전송 실패',
  submitted: '접수',
};

export function adminFetch(env) {
  return env.adminFetch ?? fetch;
}

export function summarizeChecks(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return 'none';
  if (runs.some((run) => run?.status !== 'completed')) return 'running';
  const failed = runs.some((run) => {
    const conclusion = run?.conclusion;
    return conclusion && conclusion !== 'success' && conclusion !== 'skipped' && conclusion !== 'neutral';
  });
  if (failed) return 'failure';
  if (runs.some((run) => run?.conclusion === 'success')) return 'success';
  return 'none';
}

function configured(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function posthogHost(env) {
  const host = configured(env.POSTHOG_HOST) ? env.POSTHOG_HOST.trim() : 'https://eu.posthog.com';
  return POSTHOG_HOSTS.has(host) ? host : null;
}

async function hogql(env, query, fetchImpl) {
  if (!configured(env.POSTHOG_API_KEY) || !configured(env.POSTHOG_PROJECT_ID)) {
    return { state: 'disconnected' };
  }
  const host = posthogHost(env);
  if (!host || !/^\d+$/.test(env.POSTHOG_PROJECT_ID.trim())) return { state: 'error' };
  let response;
  try {
    response = await fetchImpl(`${host}/api/projects/${env.POSTHOG_PROJECT_ID.trim()}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { state: 'error' };
  }
  if (!response.ok) return { state: 'error' };
  try {
    const body = await response.json();
    return { state: 'ok', results: Array.isArray(body.results) ? body.results : [] };
  } catch {
    return { state: 'error' };
  }
}

function pair(result) {
  if (result.state !== 'ok') return result;
  const [current = 0, previous = 0] = result.results[0] ?? [];
  return { state: 'ok', current: Number(current) || 0, previous: Number(previous) || 0 };
}

export async function loadMetrics(env, fetchImpl) {
  const windowLabel = `${kstDay(7)}–${kstDay(0)} KST · rolling 7일`;
  const [wau, live, reasons, attempts, funnel, exceptions] = await Promise.all([
    hogql(env, wauQuery(), fetchImpl),
    hogql(env, liveNavigationQuery(), fetchImpl),
    hogql(env, endReasonsQuery(), fetchImpl),
    hogql(env, submissionAttemptsQuery(), fetchImpl),
    hogql(env, submissionFunnelQuery(), fetchImpl),
    hogql(env, exceptionCountQuery(), fetchImpl),
  ]);
  const wauPair = pair(wau);
  const livePair = pair(live);
  const reasonRows = reasons.state === 'ok' ? reasons.results : [];
  const countOf = (name) => Number(reasonRows.find((row) => row?.[0] === name)?.[1] ?? 0) || 0;
  const started = livePair.state === 'ok' ? livePair.current : null;
  const arrived = reasons.state === 'ok' ? countOf('arrived') : null;
  const arrivalState = livePair.state === 'error' || reasons.state === 'error'
    ? 'error'
    : (livePair.state === 'disconnected' || reasons.state === 'disconnected' ? 'disconnected' : 'ok');
  let arrival = { state: arrivalState };
  if (arrival.state === 'ok') {
    arrival = {
      state: started > 0 ? 'ok' : 'empty',
      rate: started > 0 ? Math.round((arrived / started) * 100) : null,
      started,
      arrived,
      cancelled: countOf('cancelled'),
      abandoned: countOf('abandoned'),
      definition: 'navigation_ended reason=arrived / navigation_started mode=live 고유 세션. had_arrived로 바꾸지 않음. 정의 재검토는 다음 컷.',
    };
  }
  const funnelRow = funnel.state === 'ok' ? (funnel.results[0] ?? [0, 0, 0]) : null;
  const opened = funnelRow ? Number(funnelRow[0]) || 0 : null;
  const attempted = funnelRow ? Number(funnelRow[1]) || 0 : null;
  const submitted = funnelRow ? Number(funnelRow[2]) || 0 : null;
  const exceptionRow = exceptions.state === 'ok' ? (exceptions.results[0] ?? [0, 0, 0]) : null;
  return {
    windowLabel,
    wau: wauPair.state === 'ok'
      ? { ...wauPair, delta: delta(wauPair.current, wauPair.previous), definition: '최근 7일 모든 이벤트의 고유 person_id' }
      : { state: wauPair.state },
    liveNavigation: livePair.state === 'ok'
      ? { ...livePair, delta: delta(livePair.current, livePair.previous), definition: 'navigation_started, mode=live, guide_session_id 고유 수' }
      : { state: livePair.state },
    arrival,
    funnel: funnel.state === 'ok'
      ? {
          state: 'ok',
          opened,
          attempted,
          submitted,
          rate: attempted > 0 ? Math.round((submitted / attempted) * 100) : null,
          results: attempts.state === 'ok'
            ? attempts.results.map(([result, count]) => ({
                result: String(result ?? ''),
                label: RESULT_LABELS[result] ?? String(result ?? '알 수 없음'),
                count: Number(count) || 0,
              }))
            : [],
          definition: 'place_submission_opened → place_submission_attempted → place_submitted. 탭 진입은 opened가 없다.',
        }
      : { state: funnel.state },
    exceptions: exceptions.state === 'ok'
      ? {
          state: 'ok',
          js: Number(exceptionRow[0]) || 0,
          native: Number(exceptionRow[1]) || 0,
          other: Number(exceptionRow[2]) || 0,
          definition: '$exception 수신 건수. $lib=posthog-react-native / posthog-ios. 심볼 해석은 새 네이티브 빌드 전 미입증.',
        }
      : { state: exceptions.state },
  };
}

async function github(env, path, fetchImpl) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_ADMIN_READ_TOKEN.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'motomap-admin',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { state: 'error' };
  try {
    return { state: 'ok', body: await response.json() };
  } catch {
    return { state: 'error' };
  }
}

export async function loadPulls(env, fetchImpl) {
  if (!configured(env.GITHUB_ADMIN_READ_TOKEN)) return { state: 'disconnected', items: [] };
  const pulls = await github(env, `/repos/${GITHUB_REPO}/pulls?state=open&per_page=30`, fetchImpl);
  if (pulls.state !== 'ok' || !Array.isArray(pulls.body)) return { state: 'error', items: [] };
  const items = [];
  for (const pull of pulls.body) {
    const sha = pull?.head?.sha;
    let ci = 'none';
    if (typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha)) {
      const checks = await github(env, `/repos/${GITHUB_REPO}/commits/${sha}/check-runs?per_page=100`, fetchImpl);
      ci = checks.state === 'ok' ? summarizeChecks(checks.body?.check_runs) : 'error';
    }
    items.push({
      number: pull.number,
      title: String(pull.title ?? '').slice(0, 140),
      url: `https://github.com/${GITHUB_REPO}/pull/${pull.number}`,
      ci,
    });
  }
  return { state: 'ok', items };
}

function pemToBytes(pem) {
  const body = pem.replace(/\\n/g, '\n').replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function appStoreToken(env) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(env.ASC_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: env.ASC_KEY_ID.trim(), typ: 'JWT' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: env.ASC_ISSUER_ID.trim(),
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })));
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  ));
  return `${header}.${payload}.${base64Url(signature)}`;
}

export async function loadTestflight(env, fetchImpl) {
  if (!configured(env.ASC_KEY_ID) || !configured(env.ASC_ISSUER_ID) || !configured(env.ASC_PRIVATE_KEY)) {
    return { state: 'disconnected', builds: [] };
  }
  let token;
  try {
    token = await appStoreToken(env);
  } catch {
    return { state: 'error', builds: [] };
  }
  const url = new URL('https://api.appstoreconnect.apple.com/v1/builds');
  url.searchParams.set('filter[app]', APP_STORE_APP_ID);
  url.searchParams.set('sort', '-uploadedDate');
  url.searchParams.set('limit', '5');
  url.searchParams.set('include', 'buildBetaDetail,preReleaseVersion');
  url.searchParams.set('fields[builds]', 'version,uploadedDate,processingState,expired');
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { state: 'error', builds: [] };
  }
  if (!response.ok) return { state: 'error', builds: [] };
  try {
    const body = await response.json();
    const included = new Map((body.included ?? []).map((item) => [item.id, item]));
    const builds = (body.data ?? []).map((build) => {
      const beta = included.get(build.relationships?.buildBetaDetail?.data?.id);
      const version = included.get(build.relationships?.preReleaseVersion?.data?.id);
      return {
        buildNumber: build.attributes?.version ?? null,
        uploadedDate: build.attributes?.uploadedDate ?? null,
        processingState: build.attributes?.processingState ?? null,
        expired: build.attributes?.expired === true,
        externalBuildState: beta?.attributes?.externalBuildState ?? null,
        internalBuildState: beta?.attributes?.internalBuildState ?? null,
        marketingVersion: version?.attributes?.version ?? null,
      };
    });
    return { state: 'ok', builds };
  } catch {
    return { state: 'error', builds: [] };
  }
}

function serviceHeaders(secret) {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
}

async function rest(env, path, init, fetchImpl) {
  const secret = configured(env.SUPABASE_SECRET_KEY) ? env.SUPABASE_SECRET_KEY.trim() : '';
  const base = configured(env.SUPABASE_URL) ? env.SUPABASE_URL.trim().replace(/\/$/, '') : '';
  if (!secret || !base) return { state: 'disconnected' };
  let response;
  try {
    response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { ...serviceHeaders(secret), ...init?.headers },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { state: 'error' };
  }
  if (!response.ok) {
    let code = '';
    try {
      const body = await response.json();
      code = typeof body?.code === 'string' ? body.code : '';
    } catch {
      code = '';
    }
    if (response.status === 404 || code === 'PGRST205' || code === '42P01' || code === 'PGRST202') {
      return { state: 'migration_missing' };
    }
    return { state: 'error' };
  }
  if (response.status === 204) return { state: 'ok', body: null };
  try {
    return { state: 'ok', body: await response.json() };
  } catch {
    return { state: 'error' };
  }
}

function text(value, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function aiLabel(kind, row) {
  if (kind === 'place' || kind === 'course') {
    const reason = text(row.ai_reject_reason, 240);
    return reason
      ? { state: 'stored', label: `AI 반려 문구 · ${reason}` }
      : { state: 'missing', label: 'AI 판정 미저장' };
  }
  if (kind === 'riding_guide') {
    const resolution = row.ai_recommendation?.resolution;
    return typeof resolution === 'string'
      ? { state: 'stored', label: `AI 추천 · ${resolution}` }
      : { state: 'missing', label: 'AI 판정 미저장' };
  }
  return { state: 'none', label: 'AI 없음' };
}

export async function loadQueue(env, fetchImpl) {
  const secretReady = configured(env.SUPABASE_SECRET_KEY) && configured(env.SUPABASE_URL);
  if (!secretReady) return { state: 'disconnected', items: [] };
  const [places, courses, guides, feedback, changes, notes] = await Promise.all([
    rest(env, '/rest/v1/places?select=id,name,address,description,ai_reject_reason,created_at&submitted_by=not.is.null&approved=is.false&deleted_at=is.null&order=created_at.desc&limit=50', { method: 'GET' }, fetchImpl),
    rest(env, '/rest/v1/courses?select=id,name,description,section_from,section_to,ai_reject_reason,created_at&created_by=not.is.null&approved=is.false&deleted_at=is.null&order=created_at.desc&limit=50', { method: 'GET' }, fetchImpl),
    rest(env, '/rest/v1/riding_guide_submissions?select=id,title,reason,ai_recommendation,created_at&status=eq.pending&order=created_at.desc&limit=50', { method: 'GET' }, fetchImpl),
    rest(env, '/rest/v1/feedback?select=id,type,content,created_at&order=created_at.desc&limit=50', { method: 'GET' }, fetchImpl),
    rest(env, '/rest/v1/place_change_reports?select=id,reason,description,created_at,places(name,address)&status=eq.pending&order=created_at.desc&limit=50', { method: 'GET' }, fetchImpl),
    rest(env, '/rest/v1/admin_pm_recommendations?select=target_kind,target_id,body,source,updated_at', { method: 'GET' }, fetchImpl),
  ]);
  const content = [places, courses, guides, feedback, changes];
  const failed = content.find((part) => part.state !== 'ok');
  if (failed) return { state: failed.state, storage: notes.state, items: [] };
  const noteMap = notes.state === 'ok'
    ? new Map((notes.body ?? []).map((note) => [`${note.target_kind}:${note.target_id}`, note]))
    : new Map();
  const pm = (kind, id) => {
    const note = noteMap.get(`${kind}:${id}`);
    if (!note) return null;
    return { source: 'manual', body: text(note.body, 500), updatedAt: note.updated_at ?? null };
  };
  const items = [
    ...(places.body ?? []).map((row) => ({
      kind: 'place', kindLabel: '장소 제보', id: row.id, writable: true,
      title: text(row.name, 120), detail: text(row.description, 180), region: text(row.address, 120) || '—',
      ai: aiLabel('place', row), pm: pm('place', row.id),
    })),
    ...(courses.body ?? []).map((row) => ({
      kind: 'course', kindLabel: '코스', id: row.id, writable: false,
      title: text(row.name, 120), detail: text(row.description, 180),
      region: [text(row.section_from, 40), text(row.section_to, 40)].filter(Boolean).join(' → ') || '—',
      ai: aiLabel('course', row), pm: pm('course', row.id),
    })),
    ...(guides.body ?? []).map((row) => ({
      kind: 'riding_guide', kindLabel: '라이딩 추천', id: row.id, writable: false,
      title: text(row.title, 120) || '제목 없음', detail: text(row.reason, 180), region: '—',
      ai: aiLabel('riding_guide', row), pm: pm('riding_guide', row.id),
    })),
    ...(feedback.body ?? []).map((row) => ({
      kind: 'feedback', kindLabel: '건의', id: row.id, writable: false,
      title: text(row.type, 40), detail: text(row.content, 180), region: '—',
      ai: aiLabel('feedback', row), pm: pm('feedback', row.id),
    })),
    ...(changes.body ?? []).map((row) => ({
      kind: 'place_change', kindLabel: '정보 수정', id: row.id, writable: false,
      title: text(row.places?.name, 120) || text(row.reason, 80),
      detail: text(row.description, 180) || text(row.reason, 80),
      region: text(row.places?.address, 120) || '—',
      ai: aiLabel('place_change', row), pm: pm('place_change', row.id),
    })),
  ];
  return { state: 'ok', storage: notes.state, items };
}

export async function loadManual(env, fetchImpl) {
  const rows = await rest(
    env,
    '/rest/v1/admin_manual_items?select=id,kind,title,status,source,updated_at&order=created_at.asc&limit=100',
    { method: 'GET' },
    fetchImpl,
  );
  if (rows.state !== 'ok') return { state: rows.state, weeklyCut: [], qa: [] };
  const mapRow = (row) => ({
    id: row.id,
    title: text(row.title, 200),
    status: row.status,
    source: row.source,
    updatedAt: row.updated_at,
  });
  return {
    state: 'ok',
    weeklyCut: (rows.body ?? []).filter((row) => row.kind === 'weekly_cut').map(mapRow),
    qa: (rows.body ?? []).filter((row) => row.kind === 'qa').map(mapRow),
  };
}

export async function callRpc(env, name, args, fetchImpl) {
  const result = await rest(env, `/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  }, fetchImpl);
  if (result.state !== 'ok') return result;
  const body = Array.isArray(result.body) ? result.body[0] : result.body;
  if (!body || typeof body !== 'object') return { state: 'error' };
  return { state: 'ok', body };
}
