import { requireEnv } from '@/lib/env';
import type { RoutePriority } from '@/modules/kakao-navi';

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
