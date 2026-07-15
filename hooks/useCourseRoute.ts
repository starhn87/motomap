import { useQuery } from '@tanstack/react-query';

import { fetchRoute, type Route } from '@/lib/api/directions';

// 코스의 waypoint 들(직선 연결)을 실제 주행 도로 경로로 바꾼다 —
// 첫 점을 출발, 끝 점을 도착, 중간 점들을 경유지로 네이버 Directions 에 넘긴다.
// 코스 경로는 사실상 고정이라 하루 동안 캐시하고, 실패하면 호출부가 직선으로 fallback 한다.
export function useCourseRoute(
  courseId: string | null,
  coordinates: [number, number][] | undefined,
) {
  return useQuery<Route>({
    queryKey: ['course-route', courseId],
    queryFn: () => {
      const pts = coordinates!;
      return fetchRoute(pts[0], pts[pts.length - 1], pts.slice(1, -1));
    },
    enabled: !!courseId && (coordinates?.length ?? 0) >= 2,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
