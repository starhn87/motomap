// API HUB의 지역 검색은 네이버 지도 앱의 검색과 별개이며 최대 5건만 제공한다.
export interface NaverLocalPlace {
  placeName: string;
  address: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  phone: string;
  placeUrl: string;
  source: 'naver';
}

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 2_000) throw new Error('invalid_response');
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export function parseNaverLocal(body: unknown): NaverLocalPlace[] {
  const data = body as { items?: unknown; total?: unknown } | null;
  if (!data || !Array.isArray(data.items) || data.items.length > 5 ||
      !Number.isInteger(data.total) || Number(data.total) < 0) throw new Error('invalid_response');
  return data.items.map((item) => {
    const row = item as Record<string, unknown>;
    if (!row || typeof row !== 'object') throw new Error('invalid_response');
    // 실제 API HUB 응답의 WGS84 좌표는 10^7배 정수 문자열이다.
    if (typeof row.mapx !== 'string' || typeof row.mapy !== 'string' ||
        !/^\d{9,10}$/.test(row.mapx) || !/^\d{9,10}$/.test(row.mapy)) throw new Error('invalid_response');
    const longitude = Number(row.mapx) / 10_000_000;
    const latitude = Number(row.mapy) / 10_000_000;
    const placeName = text(row.title);
    const address = text(row.address);
    const roadAddress = text(row.roadAddress);
    if (!placeName || (!address && !roadAddress) || latitude < 32 || latitude > 39 ||
        longitude < 124 || longitude > 132) throw new Error('invalid_response');
    return { placeName, address, roadAddress, latitude, longitude, phone: text(row.telephone),
      // 외부 업체 URL이나 지도 소비자용 ID를 장소 식별자로 사용하지 않는다.
      placeUrl: `https://map.naver.com/p/search/${encodeURIComponent(placeName)}`, source: 'naver' };
  });
}

interface Dependencies {
  clientId: string;
  clientSecret: string;
  fetch: typeof fetch;
  limit: (req: Request) => Promise<Response | null>;
}
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers }); }

export function createNaverLocalHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ kind: 'invalid_request' }, 405);
    let query: string;
    try {
      // Content-Length가 없거나 거짓이어도 본문을 무제한으로 읽지 않는다.
      const reader = req.body?.getReader();
      if (!reader) return json({ kind: 'invalid_request' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2_048) { await reader.cancel(); return json({ kind: 'invalid_request' }, 413); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      query = typeof body?.query === 'string' ? body.query.normalize('NFKC').trim() : '';
      if (query.length < 2 || query.length > 150 || [...query].some((char) =>
        char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127)) {
        return json({ kind: 'invalid_request' }, 400);
      }
    } catch { return json({ kind: 'invalid_request' }, 400); }
    if (!deps.clientId || !deps.clientSecret) return json({ kind: 'configuration' }, 503);
    try {
      const limited = await deps.limit(req);
      if (limited) {
        return new Response(limited.body, { status: limited.status,
          headers: { ...headers, 'Retry-After': limited.headers.get('Retry-After') ?? '60' } });
      }
    } catch { return json({ kind: 'temporary' }, 503); }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    req.signal.addEventListener('abort', cancel, { once: true });
    if (req.signal.aborted) controller.abort();
    const timer = setTimeout(cancel, 8_000);
    try {
      const url = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
      url.searchParams.set('query', query);
      url.searchParams.set('display', '5');
      url.searchParams.set('start', '1');
      url.searchParams.set('sort', 'random');
      const res = await deps.fetch(url, { signal: controller.signal, headers: {
        'X-NCP-APIGW-API-KEY-ID': deps.clientId, 'X-NCP-APIGW-API-KEY': deps.clientSecret,
        Accept: 'application/json',
      } });
      if (!res.ok) return json({ kind: res.status === 401 || res.status === 403 ? 'configuration'
        : res.status === 429 ? 'rate_limited' : 'temporary' }, res.status === 429 ? 429 : 502);
      const results = parseNaverLocal(await res.json());
      if (controller.signal.aborted) return json({ kind: 'timeout' }, 502);
      return json({ results });
    } catch { return json({ kind: controller.signal.aborted ? 'timeout' : 'invalid_response' }, 502); }
    finally { clearTimeout(timer); req.signal.removeEventListener('abort', cancel); }
  };
}
