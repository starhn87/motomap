// 네이버 Maps Geocoding 프록시 — 클라이언트 번들에 API secret을 넣지 않는다.
// 요청(POST JSON): { address: string }
// 응답: { result: { latitude, longitude, address } | null }
//
// secrets: NAVER_CLOUD_CLIENT_ID, NAVER_CLOUD_CLIENT_SECRET, RATE_LIMIT_SALT

import { enforceRateLimits } from '../_shared/rateLimit.ts';

const CLIENT_ID = Deno.env.get('NAVER_CLOUD_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('NAVER_CLOUD_CLIENT_SECRET') ?? '';
const MAX_BODY_BYTES = 2_048;

interface NaverAddress {
  x?: string;
  y?: string;
  roadAddress?: string;
  jibunAddress?: string;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return json({ error: '주소 검색 서비스를 준비하지 못했습니다.' }, 503);
  }

  let address: string;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: '요청 내용이 너무 깁니다.' }, 413);
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    address = typeof body.address === 'string' ? body.address.normalize('NFKC').trim() : '';
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  const hasControlCharacter = [...address].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (address.length < 2 || address.length > 150 || hasControlCharacter) {
    return json({ error: '유효한 주소 필요' }, 400);
  }

  try {
    const limited = await enforceRateLimits(req, [
      { scope: 'naver-geocode-burst', limit: 20, windowSeconds: 5 * 60 },
      { scope: 'naver-geocode-daily', limit: 100, windowSeconds: 24 * 60 * 60 },
    ]);
    if (limited) return limited;
  } catch (e) {
    console.error('naver-geocode rate limit error', e);
    return json({ error: '주소 검색 서비스를 준비하지 못했습니다.' }, 503);
  }

  try {
    const url = new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
    url.searchParams.set('query', address);
    url.searchParams.set('count', '1');
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'x-ncp-apigw-api-key-id': CLIENT_ID,
        'x-ncp-apigw-api-key': CLIENT_SECRET,
      },
    });
    if (!res.ok) throw new Error(`Naver Geocoding ${res.status}`);

    const first = ((await res.json()) as { addresses?: NaverAddress[] }).addresses?.[0];
    if (!first) return json({ result: null });
    const latitude = Number(first.y);
    const longitude = Number(first.x);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < 32 ||
      latitude > 39 ||
      longitude < 124 ||
      longitude > 132
    ) {
      return json({ result: null });
    }

    return json({
      result: {
        latitude,
        longitude,
        address: first.roadAddress || first.jibunAddress || address,
      },
    });
  } catch (e) {
    console.error('naver-geocode error', e);
    return json({ error: '주소를 검색하지 못했습니다.' }, 502);
  }
});
