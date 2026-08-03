// 구글 Places(New) 영업시간 프록시.
//
// 앱이 구글 키를 갖지 않도록 서버에서 부르고, 캐시로 호출량을 줄인다.
// 요청은 POST JSON: { sourceKey, name, lat, lng }
//   sourceKey  우리 쪽 식별자 — 등록 장소 uuid / 오피넷 UNI_ID / "poi:위도,경도"
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
// secrets: GOOGLE_PLACES_API_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const TTL_DAYS = 30;

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hhmm(t: GoogleTime): string {
  return `${String(t.hour ?? 0).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}`;
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
  if (!GOOGLE_KEY) return json({ error: 'GOOGLE_PLACES_API_KEY 미설정' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  const sourceKey = String(body.sourceKey ?? '');
  const name = String(body.name ?? '');
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!sourceKey || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'sourceKey/name/lat/lng 필요' }, 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1) place_id — 한 번 찾으면 계속 쓴다
    const { data: link } = await db
      .from('google_place_links')
      .select('google_place_id')
      .eq('source_key', sourceKey)
      .maybeSingle();

    let placeId = link?.google_place_id as string | undefined;
    if (!placeId) {
      const found = await findPlaceId(name, lat, lng);
      // 구글에도 없는 곳이 있다. 매번 다시 찾지 않도록 그것도 기록해 두고 싶지만,
      // 새로 생긴 가게가 영영 안 잡히므로 기록하지 않는다
      if (!found) return json({ hours: null, businessStatus: null });
      placeId = found.id;
      await db.from('google_place_links').upsert({
        source_key: sourceKey,
        google_place_id: placeId,
        matched_name: found.name,
      });
    }

    // 2) 영업시간 — 30일 안쪽이면 캐시
    const { data: cached } = await db
      .from('google_place_hours')
      .select('hours, business_status, fetched_at')
      .eq('google_place_id', placeId)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < TTL_DAYS * 86400_000) {
        return json({ hours: cached.hours, businessStatus: cached.business_status });
      }
    }

    const fresh = await fetchDetails(placeId);
    await db.from('google_place_hours').upsert({
      google_place_id: placeId,
      hours: fresh.hours,
      business_status: fresh.businessStatus,
      fetched_at: new Date().toISOString(),
    });
    return json(fresh);
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 502);
  }
});
