import { useQuery } from '@tanstack/react-query';

import { fetchRoute, type Route } from '@/lib/api/directions';

// 코스의 waypoint 들(직선 연결)을 실제 주행 도로 경로로 바꾼다 —
// 첫 점을 출발, 끝 점을 도착, 중간 점들을 경유지로 네이버 Directions 에 넘긴다.
// 코스 경로는 사실상 고정이라 하루 동안 캐시하고, 실패하면 호출부가 직선으로 fallback 한다.
export function useCourseRoute(
  courseId: string | null,
  coordinates: [number, number][] | undefined,
) {
  const sig = coordinates?.map(([lng, lat]) => `${lng},${lat}`).join('|') ?? '';
  return useQuery<Route>({
    // 좌표가 바뀌면(코스 데이터 정비 등) 캐시를 새로 받도록 키에 좌표 시그니처 포함
    queryKey: ['course-route', courseId, sig],
    queryFn: () => {
      const pts = coordinates!;
      let goal = pts[pts.length - 1];
      // 순환 코스(시작=끝)는 동일 좌표를 API 가 거부한다 — 100m 오프셋으로 완주 경로
      if (Math.abs(goal[0] - pts[0][0]) < 1e-6 && Math.abs(goal[1] - pts[0][1]) < 1e-6) {
        goal = [pts[0][0] + 0.001, pts[0][1]];
      }
      return fetchRoute(pts[0], goal, pts.slice(1, -1));
    },
    enabled: !!courseId && (coordinates?.length ?? 0) >= 2,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
