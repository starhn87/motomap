import { requireEnv } from '@/lib/env';

const CLIENT_ID = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID, 'EXPO_PUBLIC_NAVER_CLIENT_ID');
const CLIENT_SECRET = requireEnv(process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET, 'EXPO_PUBLIC_NAVER_CLIENT_SECRET');

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
  destination: [number, number] // [lng, lat]
): Promise<Route> {
  const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${origin[0]},${origin[1]}&goal=${destination[0]},${destination[1]}&option=trafast`;

  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': CLIENT_ID,
      'x-ncp-apigw-api-key': CLIENT_SECRET,
    },
  });

  const data = await res.json();

  if (data.code !== 0 || !data.route?.trafast?.length) {
    throw new Error(data.message ?? data?.error?.message ?? '경로를 찾을 수 없습니다.');
  }

  const route = data.route.trafast[0];
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
