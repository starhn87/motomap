// 구글 Places(New) 영업시간 프록시.
//
// 앱이 구글 키를 갖지 않도록 서버에서 부르고, 캐시로 호출량을 줄인다.
// 요청은 POST JSON: { sourceKey, name, lat, lng }
//   sourceKey  우리 쪽 식별자 — 등록 장소 "place:uuid" / "poi:위도,경도"
//              이 키로 place_id 를 영구 보관해 두 번째부터는 검색을 건너뛴다
//
// 비용 구조 (2026-08 기준):
//   Text Search Essentials  월 10,000 무료 — place_id 를 처음 찾을 때만
//   Place Details Pro       월  5,000 무료 — 영업시간은 Pro 필드다
// 캐시가 30일이라 결국 "월간 고유 장소 수"만큼만 나간다.
//
// 약관: place_id 는 무기한 보관 가능하지만 영업시간 본문은 30일이 상한이다.
// TTL_DAYS 를 늘리는 건 계약 위반이다 — 늘리지 말 것.
//
// secrets: GOOGLE_PLACES_API_KEY, RATE_LIMIT_SALT

import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { enforceRateLimits } from '../_shared/rateLimit.ts';

const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TTL_DAYS = 30;
const MAX_BODY_BYTES = 4_096;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Date.getDay() 와 같은 순서 — 구글 period.day 도 0=일요일이다
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type DayKey = (typeof DAY_KEYS)[number];
interface Span {
  open: string;
  close: string;
}
type Hours = Partial<Record<DayKey, Span[] | null>> & { note?: string };

interface GoogleTime {
  day?: number;
  hour?: number;
  minute?: number;
}

interface ResolvedRequest {
  cacheKey: string;
  name: string;
  lat: number;
  lng: number;
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hhmm(t: GoogleTime): string {
  return `${String(t.hour ?? 0).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}`;
}

function hasServiceRole(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveRequest(
  body: Record<string, unknown>,
  trustedInternalRequest: boolean,
): Promise<ResolvedRequest> {
  if (
    typeof body.sourceKey !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.lat !== 'number' ||
    typeof body.lng !== 'number'
  ) {
    throw new RequestError(400, 'sourceKey/name/lat/lng 필요');
  }

  const sourceKey = body.sourceKey.trim();
  const name = body.name.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const lat = body.lat;
  const lng = body.lng;
  if (
    !name ||
    name.length > 120 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 32 ||
    lat > 39 ||
    lng < 124 ||
    lng > 132
  ) {
    throw new RequestError(400, '유효한 국내 장소 정보 필요');
  }

  const placeMatch = /^place:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
    sourceKey,
  );
  if (placeMatch) {
    const placeId = placeMatch[1].toLowerCase();
    // 심사 함수는 아직 미승인인 같은 id의 장소를 대조하므로 service_role 요청만
    // 전달값을 신뢰한다. 앱 요청은 DB의 승인 장소 정보로 반드시 덮어쓴다.
    if (trustedInternalRequest) {
      return { cacheKey: `place:${placeId}`, name, lat, lng };
    }

    const { data: place, error } = await db
      .rpc('all_places', { category_filter: null })
      .eq('id', placeId)
      .maybeSingle();
    if (error) throw error;
    if (!place) throw new RequestError(404, '등록 장소를 찾을 수 없습니다.');
    const canonical = place as { name: string; latitude: number; longitude: number };
    return {
      cacheKey: `place:${placeId}`,
      name: canonical.name,
      lat: canonical.latitude,
      lng: canonical.longitude,
    };
  }

  const poiKey = `poi:${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (sourceKey !== poiKey) throw new RequestError(400, '유효하지 않은 sourceKey');

  // 좌표만 키로 쓰면 같은 좌표에 공격자가 다른 상호를 먼저 연결해 영구 캐시를
  // 오염시킬 수 있다. 정규화한 상호까지 서버에서 해시해 서로 다른 키로 격리한다.
  const nameHash = await sha256(name.toLocaleLowerCase('ko-KR'));
  return { cacheKey: `${poiKey}:${nameHash}`, name, lat, lng };
}

/**
 * 구글 periods 를 우리 Hours 로. 구글은 열려 있는 구간만 주므로, 없는 요일은
 * 휴무([])가 맞다 — 영업시간표 자체가 없을 때만 null 을 돌려 판정을 포기한다.
 */
function toHours(regular: { periods?: { open?: GoogleTime; close?: GoogleTime }[] } | undefined): Hours | null {
  const periods = regular?.periods;
  if (!periods?.length) return null;

  const hours: Hours = {};
  for (const key of DAY_KEYS) hours[key] = [];

  for (const p of periods) {
    if (p.open?.day == null) continue;
    // close 가 없으면 24시간 영업 — 구글은 이때 period 를 하나만 준다
    if (!p.close) {
      for (const key of DAY_KEYS) hours[key] = [{ open: '00:00', close: '24:00' }];
      return hours;
    }
    const day = DAY_KEYS[p.open.day];
    // close 가 open 보다 이르면 우리 쪽에서 익일로 해석한다 (11:00-02:00)
    (hours[day] as Span[]).push({ open: hhmm(p.open), close: hhmm(p.close) });
  }
  return hours;
}

/** 이름·좌표로 place_id 찾기. 엉뚱한 가게를 물어오면 영업중이 통째로 거짓말이 된다. */
async function findPlaceId(
  name: string,
  lat: number,
  lng: number,
): Promise<{ id: string; name: string } | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      // id 만 받으면 무료지만 매칭을 검증할 수 없다. 이름·좌표까지 Essentials 로 받는다
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: name,
      languageCode: 'ko',
      maxResultCount: 3,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 300 },
      },
    }),
  });
  if (!res.ok) throw new Error(`구글 검색 ${res.status}`);

  const places = (await res.json())?.places ?? [];
  for (const p of places) {
    const plat = p.location?.latitude;
    const plng = p.location?.longitude;
    if (typeof plat !== 'number' || typeof plng !== 'number') continue;
    const meters = Math.hypot((plat - lat) * 111000, (plng - lng) * 88000);
    // 좌표가 붙어 있어야 같은 곳으로 본다. 상호는 표기가 갈려 신뢰도가 낮다
    if (meters < 150) {
      return { id: p.id, name: p.displayName?.text ?? '' };
    }
  }
  return null;
}

async function fetchDetails(placeId: string) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko`,
    {
      headers: {
        'X-Goog-Api-Key': GOOGLE_KEY,
        // 정규 영업시간이 비어 있고 currentOpeningHours(향후 7일)만 있는 장소가
        // 있다. 둘 다 Pro 티어라 함께 받아도 요금은 같다
        'X-Goog-FieldMask': 'regularOpeningHours,currentOpeningHours,businessStatus',
      },
    },
  );
  if (!res.ok) throw new Error(`구글 상세 ${res.status}`);
  const data = await res.json();
  return {
    hours: toHours(data.regularOpeningHours) ?? toHours(data.currentOpeningHours),
    businessStatus: data.businessStatus ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
  if (!GOOGLE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: '영업시간 서비스를 준비하지 못했습니다.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: '요청 내용이 너무 깁니다.' }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  let input: ResolvedRequest;
  try {
    input = await resolveRequest(body, hasServiceRole(req));
  } catch (e) {
    if (e instanceof RequestError) return json({ error: e.message }, e.status);
    console.error('place-hours request validation error', e);
    return json({ error: '장소 정보를 확인하지 못했습니다.' }, 503);
  }

  if (!hasServiceRole(req)) {
    try {
      const limited = await enforceRateLimits(req, [
        { scope: 'place-hours-burst', limit: 30, windowSeconds: 5 * 60 },
        { scope: 'place-hours-daily', limit: 200, windowSeconds: 24 * 60 * 60 },
      ]);
      if (limited) return limited;
    } catch (e) {
      console.error('place-hours rate limit error', e);
      return json({ error: '영업시간 서비스를 준비하지 못했습니다.' }, 503);
    }
  }

  try {
    const { cacheKey: sourceKey, name, lat, lng } = input;
    // 1) place_id — 한 번 찾으면 계속 쓴다
    const { data: link, error: linkError } = await db
      .from('google_place_links')
      .select('google_place_id')
      .eq('source_key', sourceKey)
      .maybeSingle();
    if (linkError) throw linkError;

    let placeId = link?.google_place_id as string | undefined;
    if (!placeId) {
      const found = await findPlaceId(name, lat, lng);
      // 구글에도 없는 곳이 있다. 매번 다시 찾지 않도록 그것도 기록해 두고 싶지만,
      // 새로 생긴 가게가 영영 안 잡히므로 기록하지 않는다
      if (!found) return json({ hours: null, businessStatus: null });
      placeId = found.id;
      const { error: linkWriteError } = await db.from('google_place_links').upsert({
        source_key: sourceKey,
        google_place_id: placeId,
        matched_name: found.name,
      });
      if (linkWriteError) throw linkWriteError;
    }

    // 2) 영업시간 — 30일 안쪽이면 캐시
    const { data: cached, error: cacheError } = await db
      .from('google_place_hours')
      .select('hours, business_status, fetched_at')
      .eq('google_place_id', placeId)
      .maybeSingle();
    if (cacheError) throw cacheError;

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < TTL_DAYS * 86400_000) {
        return json({ hours: cached.hours, businessStatus: cached.business_status });
      }
    }

    const fresh = await fetchDetails(placeId);
    const { error: cacheWriteError } = await db.from('google_place_hours').upsert({
      google_place_id: placeId,
      hours: fresh.hours,
      business_status: fresh.businessStatus,
      fetched_at: new Date().toISOString(),
    });
    if (cacheWriteError) throw cacheWriteError;
    return json(fresh);
  } catch (e) {
    console.error('place-hours error', e);
    return json({ error: '영업시간을 불러오지 못했습니다.' }, 502);
  }
});
