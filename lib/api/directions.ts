import { requireEnv } from '@/lib/env';

const KAKAO_KEY = requireEnv(
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
  'EXPO_PUBLIC_KAKAO_REST_API_KEY'
);
const NAVER_ID = requireEnv(
  process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
  'EXPO_PUBLIC_NAVER_CLIENT_ID'
);
const NAVER_SECRET = requireEnv(
  process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
  'EXPO_PUBLIC_NAVER_CLIENT_SECRET'
);

// 이륜차는 고속도로·자동차 전용도로를 통행할 수 없다(도로교통법 제63조).
// 카카오모빌리티 길찾기는 차종에 이륜차(car_type=7)가 있어 그 길들을 애초에 빼고
// 경로를 잡는다. 네이버의 traavoidcaronly 는 "자동차 전용도로 회피"라는 우회적
// 근사였고, 이쪽이 원리적으로 맞다 (실측 강남→미사리: 소형 33분에 올림픽대로·
// 서울양양고속도로 포함 → 이륜차 45분, 금지 도로 없음).
// 지도 표시는 여전히 네이버 SDK 를 쓴다 — 경로 계산만 카카오로 받는다.
const KAKAO_CAR_TYPE_MOTORCYCLE = 7;
// 경유지는 카카오 자동차 길찾기 제한이 5개
const MAX_WAYPOINTS = 5;

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

/**
 * 이륜차 경로. 카카오(진짜 이륜차 차종)를 먼저 쓰고, 실패하면 네이버로 받는다.
 * 카카오는 도로에서 떨어진 지점(산속 뷰포인트 등)을 거절하는 편이라 실측 20곳 중
 * 2곳이 실패했다 — 네이버는 스냅이 관대해 20곳 모두 성공. 정확도는 카카오가,
 * 견고성은 네이버가 나아서 둘을 겹쳐 쓴다.
 */
export async function fetchRoute(
  origin: [number, number],
  destination: [number, number],
  waypoints?: [number, number][]
): Promise<Route> {
  try {
    return await fetchKakaoRoute(origin, destination, waypoints);
  } catch {
    return fetchNaverRoute(origin, destination, waypoints);
  }
}

async function fetchKakaoRoute(
  origin: [number, number], // [lng, lat]
  destination: [number, number], // [lng, lat]
  waypoints?: [number, number][]
): Promise<Route> {
  const params = new URLSearchParams({
    origin: `${origin[0]},${origin[1]}`,
    destination: `${destination[0]},${destination[1]}`,
    car_type: String(KAKAO_CAR_TYPE_MOTORCYCLE),
    priority: 'RECOMMEND',
    road_details: 'true',
    summary: 'false',
  });
  if (waypoints?.length) {
    params.set(
      'waypoints',
      waypoints
        .slice(0, MAX_WAYPOINTS)
        .map(([lng, lat]) => `${lng},${lat}`)
        .join('|')
    );
  }

  const res = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`경로 요청 실패 (HTTP ${res.status})`);
  }

  const data = await res.json();
  const route = data.routes?.[0];

  // 경로 자체를 못 찾은 경우도 HTTP 200 으로 오고 result_code 에 사유가 담긴다
  if (!route || route.result_code !== 0) {
    throw new Error(route?.result_msg ?? '경로를 찾을 수 없습니다.');
  }

  // vertexes 는 [x1, y1, x2, y2, ...] 평면 배열 — 좌표쌍으로 되접는다
  const geometry: [number, number][] = [];
  const steps: RouteStep[] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v: number[] = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) geometry.push([v[i], v[i + 1]]);
    }
    for (const guide of section.guides ?? []) {
      if (!guide.guidance) continue;
      steps.push({
        instruction: guide.guidance,
        distance: guide.distance ?? 0,
        duration: guide.duration ?? 0,
      });
    }
  }

  return {
    distance: route.summary.distance,
    duration: route.summary.duration, // 카카오는 초 단위로 준다
    geometry,
    steps,
  };
}

// 폴백 — 이륜차 차종이 없어 "자동차 전용도로 회피"로 근사한다
const NAVER_OPTION = 'traavoidcaronly';

async function fetchNaverRoute(
  origin: [number, number],
  destination: [number, number],
  waypoints?: [number, number][]
): Promise<Route> {
  const via = waypoints?.length
    ? `&waypoints=${waypoints
        .slice(0, MAX_WAYPOINTS)
        .map(([lng, lat]) => `${lng},${lat}`)
        .join('|')}`
    : '';
  const res = await fetch(
    `https://maps.apigw.ntruss.com/map-direction/v1/driving` +
      `?start=${origin[0]},${origin[1]}&goal=${destination[0]},${destination[1]}` +
      `&option=${NAVER_OPTION}${via}`,
    {
      headers: {
        'x-ncp-apigw-api-key-id': NAVER_ID,
        'x-ncp-apigw-api-key': NAVER_SECRET,
      },
    }
  );

  if (!res.ok) throw new Error(`경로 요청 실패 (HTTP ${res.status})`);

  const data = await res.json();
  if (data.code !== 0 || !data.route?.[NAVER_OPTION]?.length) {
    throw new Error(data.message ?? data?.error?.message ?? '경로를 찾을 수 없습니다.');
  }

  const route = data.route[NAVER_OPTION][0];
  return {
    distance: route.summary.distance,
    duration: Math.round(route.summary.duration / 1000), // ms → seconds
    geometry: route.path,
    steps: (route.guide ?? []).map((g: any) => ({
      instruction: g.instructions ?? '',
      distance: g.distance ?? 0,
      duration: g.duration ?? 0,
    })),
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
