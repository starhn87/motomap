import { Alert } from 'react-native';
import { create } from 'zustand';
import { router } from 'expo-router';

import { useMapStore } from '@/stores/useMapStore';
import { fetchNearbyHazards } from '@/lib/api/hazards';
import { HAZARDS } from '@/constants/hazards';
import type { RoadHazard } from '@/types';
import { checkRouteWeather } from '@/lib/api/weather';

export interface NavTarget {
  name: string;
  latitude: number;
  longitude: number;
  /** 등록 장소면 그 id — 도착 후 리뷰 연결에 쓴다 */
  placeId?: string;
}

/** 코스 내비 대상 — points 는 코스 순서(출발지 → 경유지들 → 도착지) */
export interface NavCourse {
  id: string;
  name: string;
  points: { latitude: number; longitude: number; name?: string }[];
}

// 길안내는 항상 앱 안 미리보기 화면(app/navi.tsx)으로 간다 — 옵션별 경로를
// 지도로 보여주고 고르면 KNSDK 안내를 시작한다. 외부 내비 앱 선택은 제거했다.
// vias 는 [lng, lat, ...] 평면 배열 — 코스 안내의 경유지.
// start 를 주면 그 지점에서 출발(길찾기), 없으면 현재 위치에서 출발.
function launchInAppNavi(
  target: NavTarget,
  vias?: number[],
  start?: NavTarget,
  courseId?: string,
) {
  router.push({
    pathname: '/navi',
    params: {
      lng: String(target.longitude),
      lat: String(target.latitude),
      name: target.name,
      ...(vias && vias.length > 0 ? { vias: JSON.stringify(vias) } : {}),
      ...(target.placeId ? { pid: target.placeId } : {}),
      ...(courseId ? { cid: courseId } : {}),
      ...(start
        ? {
            slng: String(start.longitude),
            slat: String(start.latitude),
            sname: start.name,
          }
        : {}),
    },
  });
}

// 경유지 상한에 맞춰 추림 — 코스 출발지(첫 점)는 보존하고 나머지를 고르게 선택.
// 실측(영남알프스 순환 코스, 도로 스냅 지오메트리 기준 재현율): 3개 47% → 5개 77%
// → 12개 94% → 20개 100%. KNSDK 가 20개를 거부하면 /navi 가 줄여가며 재시도한다.
const MAX_VIAS = 20;
function sampleWaypoints<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const [first, ...rest] = points;
  const picked = [first];
  for (let i = 0; i < max - 1; i++) {
    picked.push(rest[Math.round(((i + 1) * rest.length) / (max - 1)) - 1]);
  }
  return picked;
}

// 내비 출발 전 경로 지점들의 날씨를 확인하고, 비·눈·뇌우가 있으면 출발 여부를 묻는다.
// 취소하면 false. 날씨가 좋거나 확인에 실패하면 조용히 true (출발을 막지 않는다).
async function confirmRouteWeather(
  points: { latitude: number; longitude: number }[],
): Promise<boolean> {
  const userLocation = useMapStore.getState().userLocation;
  const allPoints = userLocation ? [userLocation, ...points] : points;
  const warning = await checkRouteWeather(allPoints);
  if (!warning) return true;

  const popText = warning.maxPop > 0 ? ` (강수확률 최대 ${warning.maxPop}%)` : '';
  const where =
    warning.regions.length > 0
      ? warning.regions.join(', ')
      : `경로 위 ${warning.count}개 지점`;
  return new Promise((resolve) => {
    Alert.alert(
      '경로 날씨 주의',
      `${where}에 ${warning.worstCondition} 소식이 있어요${popText}. 노면이 미끄러울 수 있으니 주의하세요. 그래도 출발할까요?`,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '출발', onPress: () => resolve(true) },
      ],
    );
  });
}

// 경로 주변의 노면 위험을 모아 출발 전에 알린다. 백그라운드 위치 없이도
// 성립하는 알림이라 이 자리가 이 정보의 제일 쓸모 있는 지점이다.
async function confirmRouteHazards(
  points: { latitude: number; longitude: number }[],
): Promise<boolean> {
  const userLocation = useMapStore.getState().userLocation;
  const allPoints = userLocation ? [userLocation, ...points] : points;

  let hazards: RoadHazard[] = [];
  try {
    const found = await Promise.all(
      allPoints.map((p) => fetchNearbyHazards(p.latitude, p.longitude, 1500)),
    );
    // 지점마다 겹쳐 잡히므로 id 로 합친다. 오래된 정보는 경고까지 띄우지 않는다.
    const byId = new Map<string, RoadHazard>();
    for (const h of found.flat()) {
      if (h.staleness === 0) byId.set(h.id, h);
    }
    hazards = [...byId.values()];
  } catch {
    return true; // 위험 조회 실패로 안내를 막지는 않는다
  }
  if (hazards.length === 0) return true;

  const counts = new Map<string, number>();
  for (const h of hazards) {
    const label = HAZARDS[h.type].label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = [...counts.entries()].map(([label, n]) => `${label} ${n}곳`).join(', ');

  return new Promise((resolve) => {
    Alert.alert(
      '경로 주의 구간',
      `경로 주변에 ${summary}이 제보돼 있어요. 감속해서 지나가세요. 그래도 출발할까요?`,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '출발', onPress: () => resolve(true) },
      ],
    );
  });
}

// 내비 시작 연타 방지 + 진행 표시 — 날씨·위험 확인이 수 초 걸리므로
// 진행 중에는 재진입을 막고, 버튼들이 이 상태를 구독해 스피너를 보여준다.
export const useNavLaunching = create<{ launching: boolean }>(() => ({ launching: false }));

const beginLaunch = (): boolean => {
  if (useNavLaunching.getState().launching) return false;
  useNavLaunching.setState({ launching: true });
  return true;
};
const endLaunch = () => useNavLaunching.setState({ launching: false });

/** 미리보기까지 실제로 진입했으면 true (날씨·위험 확인에서 취소하면 false) */
export async function openNavigation(target: NavTarget, start?: NavTarget): Promise<boolean> {
  if (!beginLaunch()) return false;
  try {
    const points = start ? [start, target] : [target];
    if (!(await confirmRouteWeather(points))) return false;
    if (!(await confirmRouteHazards(points))) return false;
    launchInAppNavi(target, undefined, start);
    return true;
  } finally {
    endLaunch();
  }
}

/**
 * 코스 전체 안내 — 출발지는 현재 위치, 코스 출발지~중간 지점을 경유지로 넣고
 * 코스 끝을 목적지로 안내한다.
 */
export async function openCourseNavigation(course: NavCourse) {
  if (course.points.length === 0) return;
  if (!beginLaunch()) return;
  try {
    if (!(await confirmRouteWeather(course.points))) return;
    if (!(await confirmRouteHazards(course.points))) return;

    const goal = course.points[course.points.length - 1];
    const vias = sampleWaypoints(course.points.slice(0, -1), MAX_VIAS).flatMap(
      (p) => [p.longitude, p.latitude],
    );
    launchInAppNavi(
      {
        name: course.name,
        latitude: goal.latitude,
        longitude: goal.longitude,
      },
      vias,
      undefined,
      course.id,
    );
  } finally {
    endLaunch();
  }
}
