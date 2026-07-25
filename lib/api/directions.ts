import { requireEnv } from '@/lib/env';

const CLIENT_ID = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID, 'EXPO_PUBLIC_NAVER_CLIENT_ID');
const CLIENT_SECRET = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET, 'EXPO_PUBLIC_NAVER_CLIENT_SECRET');

// 이륜차는 고속도로·자동차 전용도로를 통행할 수 없다(도로교통법 제63조).
// 네이버 Directions 의 기본격인 trafast 는 그 길을 적극적으로 태워서, 라이더가
// 실제로 갈 수 없는 경로와 그만큼 짧은 시간을 준다(실측: 강남→춘천 78분 vs 126분,
// 강남→미사리 29분 vs 47분). traavoidcaronly 도 같은 실시간 교통 기반이면서
// 자동차 전용도로만 피하므로 이륜차 앱에는 이쪽이 맞다.
const ROUTE_OPTION = 'traavoidcaronly';

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
}

export interface Route {
  distance: number; // meters
  duration: number; // seconds
  geometry: [number, number][]; // [lng, lat][]
  steps: RouteStep[];
}

export async function fetchRoute(
  origin: [number, number], // [lng, lat]
  destination: [number, number], // [lng, lat]
  waypoints?: [number, number][] // 경유지 [lng, lat][] — 네이버 Directions 제한 최대 5개
): Promise<Route> {
  const via = waypoints?.length
    ? `&waypoints=${waypoints
        .slice(0, 5)
        .map(([lng, lat]) => `${lng},${lat}`)
        .join('|')}`
    : '';
  const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${origin[0]},${origin[1]}&goal=${destination[0]},${destination[1]}&option=${ROUTE_OPTION}${via}`;

  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': CLIENT_ID,
      'x-ncp-apigw-api-key': CLIENT_SECRET,
    },
  });

  if (!res.ok) {
    throw new Error(`경로 요청 실패 (HTTP ${res.status})`);
  }

  const data = await res.json();

  if (data.code !== 0 || !data.route?.[ROUTE_OPTION]?.length) {
    throw new Error(data.message ?? data?.error?.message ?? '경로를 찾을 수 없습니다.');
  }

  const route = data.route[ROUTE_OPTION][0];
  const summary = route.summary;

  // path: [[lng, lat], ...] 형태
  const geometry: [number, number][] = route.path;

  // guide 정보를 steps로 변환
  const steps: RouteStep[] = (route.guide ?? []).map((g: any) => ({
    instruction: g.instructions ?? '',
    distance: g.distance ?? 0,
    duration: g.duration ?? 0,
  }));

  return {
    distance: summary.distance,
    duration: Math.round(summary.duration / 1000), // ms → seconds
    geometry,
    steps,
  };
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
