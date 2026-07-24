import { useQuery } from '@tanstack/react-query';

import { fetchPlacesNearCourse } from '@/lib/api/places';

// 코스 근처 장소 — RPC(places_near_course)가 아직 배포 전이거나 실패해도
// 섹션만 안 보이면 되므로 조용히 빈 목록으로 처리한다.
export function useCoursePlaces(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-places', courseId],
    queryFn: async () => {
      try {
        return await fetchPlacesNearCourse(courseId!);
      } catch {
        return [];
      }
    },
    enabled: !!courseId,
  });
}
