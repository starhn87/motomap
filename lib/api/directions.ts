import { requireEnv } from '@/lib/env';
import type { RoutePriority } from '@/modules/kakao-navi';

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

/**
 * 경로의 혼잡 구간 — 미리보기 경로선 색칠용. KNSDK 는 혼잡도 데이터를 노출하지
 * 않아 같은 엔진인 REST 로 받는다. 선형이 SDK 경로와 다를 가능성이 이론상 있으니
 * 호출부는 실패 시 SDK 선형 단색으로 폴백한다.
 * GET 길찾기는 경유지 5개 제한이라 다중 경유지 POST(최대 30개)를 쓴다 — 코스
 * 안내의 경유지 최대 20개를 수용한다.
 */
export async function fetchBikeTraffic(
  origin: [number, number], // [lng, lat]
  destination: [number, number], // [lng, lat]
  waypoints: [number, number][],
  priority: RoutePriority
): Promise<TrafficPart[]> {
  const res = await fetch('https://apis-navi.kakaomobility.com/v1/waypoints/directions', {
    method: 'POST',
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { x: origin[0], y: origin[1] },
      destination: { x: destination[0], y: destination[1] },
      waypoints: waypoints.map(([x, y], i) => ({ name: `w${i}`, x, y })),
      priority: KAKAO_PRIORITY[priority],
      car_type: KAKAO_CAR_TYPE_MOTORCYCLE,
      road_details: true,
    }),
  });
  if (!res.ok) throw new Error(`교통 정보 요청 실패 (HTTP ${res.status})`);

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route || route.result_code !== 0) {
    throw new Error(route?.result_msg ?? '교통 정보를 찾을 수 없습니다.');
  }

  // 혼잡도가 같은 연속 road 를 한 구간으로 병합한다. road 경계 좌표는 항상
  // 직전 road 의 끝과 중복이라(실측) 직전 좌표와 같으면 건너뛰고, 혼잡도가
  // 바뀌는 경계에서는 직전 좌표를 이어받아 선이 끊기지 않게 한다.
  const parts: TrafficPart[] = [];
  let cur: TrafficPart | null = null;
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v: number[] = road.vertexes ?? [];
      const state: number = road.traffic_state ?? 0;
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
