import { requireEnv } from '@/lib/env';
import { withLocationUse } from '@/stores/useLocationPrivacyStore';
import type { BikeRoute, RoutePriority } from '@/modules/kakao-navi';
import { ProviderError, providerHttpError, requireProviderAvailable } from '@/lib/providerErrors';

const KAKAO_KEY = requireEnv(
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
  'EXPO_PUBLIC_KAKAO_REST_API_KEY'
);

// 이륜차는 고속도로·자동차 전용도로를 통행할 수 없다(도로교통법 제63조).
// 카카오모빌리티 길찾기는 차종에 이륜차(car_type=7)가 있어 그 길들을 애초에 빼고
// 경로를 잡는다. 경로 자체는 KNSDK(같은 엔진)가 뽑고, 여기서는 혼잡도만 받는다.
const KAKAO_CAR_TYPE_MOTORCYCLE = 7;

// KNSDK 경로 옵션 → REST priority. MAIN_ROAD 는 공식 문서엔 없지만 동작한다(실측 2026-07-28).
const KAKAO_PRIORITY: Record<RoutePriority, string> = {
  0: 'RECOMMEND',
  1: 'TIME',
  2: 'DISTANCE',
  4: 'MAIN_ROAD',
};

/** 혼잡도가 같은 연속 경로 구간. state 는 카카오 traffic_state — 1 정체 / 2 지체 / 3 서행 / 4 원활 / 0 정보 없음 */
export interface TrafficPart {
  state: number;
  coords: { latitude: number; longitude: number }[];
}

type Coordinate = [longitude: number, latitude: number];
type KakaoRoute = {
  result_code: number;
  summary?: { distance?: number; duration?: number };
  sections?: { roads?: { vertexes?: number[]; traffic_state?: number }[] }[];
};

async function fetchKakaoDirections(
  origin: Coordinate,
  destination: Coordinate,
  waypoints: Coordinate[],
  priority: RoutePriority,
  operation: 'preview' | 'traffic',
  signal?: AbortSignal,
): Promise<KakaoRoute> {
  const res = await withLocationUse('route', 'kakao', () => fetch('https://apis-navi.kakaomobility.com/v1/waypoints/directions', {
    method: 'POST',
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { x: origin[0], y: origin[1] },
      destination: { x: destination[0], y: destination[1] },
      waypoints: waypoints.map(([x, y], i) => ({ name: `w${i}`, x, y })),
      priority: KAKAO_PRIORITY[priority],
      car_type: KAKAO_CAR_TYPE_MOTORCYCLE,
      ...(operation === 'preview' ? { avoid: ['motorway'] } : {}),
      road_details: true,
    }),
    signal,
  }));
  if (!res.ok) throw providerHttpError('kakao-directions', operation, res.status);

  const data = await res.json() as { routes?: KakaoRoute[] } | null;
  const route = data?.routes?.[0];
  if (!route || !Number.isInteger(route.result_code)) {
    throw new ProviderError('kakao-directions', operation, 'invalid_response');
  }
  if (route.result_code !== 0) {
    throw new ProviderError('kakao-directions', operation, 'invalid_request', undefined, String(route.result_code));
  }
  return route;
}

/** Android 경로선과 혼잡도는 같은 이륜차 경로 응답에서 함께 만든다. */
export async function fetchBikePreview(
  origin: Coordinate,
  destination: Coordinate,
  waypoints: Coordinate[],
  priority: RoutePriority,
  signal?: AbortSignal,
): Promise<{ route: BikeRoute; trafficParts: TrafficPart[] }> {
  requireProviderAvailable('kakao-directions');
  const result = await fetchKakaoDirections(origin, destination, waypoints, priority, 'preview', signal);
  const trafficParts = readTrafficParts(result);
  const polyline: number[] = [];
  for (const part of trafficParts) {
    for (const { longitude, latitude } of part.coords) {
      if (polyline.at(-2) !== longitude || polyline.at(-1) !== latitude) polyline.push(longitude, latitude);
    }
  }
  const { distance, duration } = result.summary ?? {};
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0
    || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || polyline.length < 4) {
    throw new ProviderError('kakao-directions', 'preview', 'invalid_response');
  }
  return { route: { distance, duration, polyline }, trafficParts };
}

/** iOS는 SDK 경로와 별도로 혼잡도를 조회한다. */
export async function fetchBikeTraffic(
  origin: Coordinate,
  destination: Coordinate,
  waypoints: Coordinate[],
  priority: RoutePriority,
): Promise<TrafficPart[]> {
  return readTrafficParts(await fetchKakaoDirections(origin, destination, waypoints, priority, 'traffic'));
}

function readTrafficParts(route: KakaoRoute): TrafficPart[] {
  // 혼잡도가 같은 연속 road 를 한 구간으로 병합한다. road 경계 좌표는 항상
  // 직전 road 의 끝과 중복이라(실측) 직전 좌표와 같으면 건너뛰고, 혼잡도가
  // 바뀌는 경계에서는 직전 좌표를 이어받아 선이 끊기지 않게 한다.
  const parts: TrafficPart[] = [];
  let cur: TrafficPart | null = null;
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? [];
      if (!v.length) continue;
      if (v.length % 2 !== 0 || !v.every((value, index) => Number.isFinite(value) && Math.abs(value) <= (index % 2 ? 90 : 180))) {
        throw new ProviderError('kakao-directions', 'geometry', 'invalid_response');
      }
      const state = road.traffic_state ?? 0;
      if (!cur || cur.state !== state) {
        const prev = cur;
        cur = { state, coords: [] };
        if (prev) cur.coords.push(prev.coords[prev.coords.length - 1]);
        parts.push(cur);
      }
      for (let i = 0; i + 1 < v.length; i += 2) {
        const last = cur.coords[cur.coords.length - 1];
        if (last && last.longitude === v[i] && last.latitude === v[i + 1]) continue;
        cur.coords.push({ longitude: v[i], latitude: v[i + 1] });
      }
    }
  }
  return parts.filter((p) => p.coords.length >= 2);
}

export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
