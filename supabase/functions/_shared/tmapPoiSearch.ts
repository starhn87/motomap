import { TMAP_POI_GROUPS, TMAP_SERVER_TTL, validTmapCell, parseTmapPois, type TmapPoi, type TmapCell } from './tmapPoi.ts';
export interface TmapSnapshot { pois: TmapPoi[]; fetchedAt: number; expiresAt: number; partial: boolean; sourceCell: TmapCell; coverageComplete: boolean }
export type TmapClaim = { state: 'hit'; snapshot: TmapSnapshot } | { state: 'claimed'; token: string; fetchedAt: number } | { state: 'busy' | 'limited' };
interface Dependencies {
  appKey: string;
  fetch: typeof fetch;
  authorize: (req: Request, secret: string, actor: string | null) => Promise<boolean>;
  limit: (req: Request) => Promise<Response | null>;
  claim: (lat: number, lon: number, coverageKm: number) => Promise<TmapClaim>;
  save: (lat: number, lon: number, token: string, snapshot: TmapSnapshot) => Promise<void>;
}
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export function createTmapPoiHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ kind: 'invalid_request' }, 405);
    let lat: number, lon: number, coverageKm: number, secret: string, actor: string | null;
    try {
      const reader = req.body?.getReader();
      if (!reader) return json({ kind: 'invalid_request' }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) { await reader.cancel(); return json({ kind: 'invalid_request' }, 413); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      lat = body.lat; lon = body.lon; coverageKm = body.coverageKm ?? 5; secret = body.secret; actor = body.actor;
      if (!validTmapCell({ lat, lon }) || !Number.isInteger(coverageKm) || coverageKm < 1 || coverageKm > 5 || typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret) ||
        (actor !== null && (typeof actor !== 'string' || !/^[a-f0-9-]{36}$/.test(actor)))) return json({ kind: 'invalid_request' }, 400);
    } catch { return json({ kind: 'invalid_request' }, 400); }
    if (!deps.appKey) return json({ kind: 'configuration' }, 503);
    try {
      const limited = await deps.limit(req);
      if (limited) return json({ kind: 'rate_limited' }, 429);
      // 클라이언트 동의 검사만 믿지 않고 같은 JWT/기기 subject의 서버 동의도 확인한다.
      if (!await deps.authorize(req, secret, actor)) return json({ kind: 'invalid_request' }, 403);
      const claim = await deps.claim(lat, lon, coverageKm);
      if (claim.state === 'hit') return json(claim.snapshot);
      if (claim.state === 'limited') return json({ kind: 'rate_limited' }, 429);
      if (claim.state !== 'claimed') return json({ kind: 'temporary' }, 503);
      const controller = new AbortController(), cancel = () => controller.abort();
      req.signal.addEventListener('abort', cancel, { once: true }); if (req.signal.aborted) cancel();
      const timer = setTimeout(cancel, 12_000);
      const pois = new Map<string, TmapPoi>(); let next = 0, partial = false, coverageComplete = true;
      try {
        const worker = async () => {
          while (next < TMAP_POI_GROUPS.length && !controller.signal.aborted) {
            const group = TMAP_POI_GROUPS[next++];
            try {
              const url = new URL('https://apis.openapi.sk.com/tmap/pois/search/around');
              const params = { version: '1', centerLat: String((lat + .5) / 50), centerLon: String((lon + .5) / 50),
                categories: group.categories.join(';'), radius: '5', count: '100', page: '1', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO' };
              for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
              const response = await deps.fetch(url, { headers: { appKey: deps.appKey, Accept: 'application/json' }, signal: controller.signal });
              if (response.status === 204) continue;
              if (!response.ok) { partial = true; if ([401, 403, 429].includes(response.status)) controller.abort(); continue; }
              const body = await response.json();
              const rows = parseTmapPois(body, group.industry);
              // 첫 페이지가 잘렸으면 검색 원 안이어도 다른 지역의 장소를 대표할 수 없다.
              coverageComplete &&= rows.length < 100 && Number(body.searchPoiInfo.totalCount) === rows.length;
              for (const poi of rows) {
                // 중복되는 넓은 업종보다 앞의 구체적 분류를 우선한다. 응답 완료 순서에 의존하지 않는다.
                const old = pois.get(poi.id);
                if (!old || TMAP_POI_GROUPS.findIndex(g => g.industry === poi.industry) < TMAP_POI_GROUPS.findIndex(g => g.industry === old.industry)) pois.set(poi.id, poi);
              }
            } catch { partial = true; }
          }
        }
        await Promise.all([worker(), worker(), worker()]);
        partial ||= controller.signal.aborted;
        const snapshot: TmapSnapshot = { pois: [...pois.values()], sourceCell: { lat, lon }, fetchedAt: claim.fetchedAt,
          expiresAt: claim.fetchedAt + (partial ? 60_000 : TMAP_SERVER_TTL), partial, coverageComplete: coverageComplete && !partial };
        // 원본 조회 시각을 유지한다. 부분 실패를23시간 정상 캐시로 저장하지 않는다.
        await deps.save(lat, lon, claim.token, snapshot);
        return json(snapshot);
      } finally { clearTimeout(timer); req.signal.removeEventListener('abort', cancel); }
    } catch { return json({ kind: 'temporary' }, 503); }
  };
}
