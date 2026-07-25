import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchNearbyHazards,
  fetchHazardsNearCourse,
  submitHazard,
  voteHazard,
} from '@/lib/api/hazards';
import type { MapCenter } from '@/hooks/usePlaces';

// 지도에 띄울 주변 노면 위험. 마이그레이션 025 배포 전이거나 실패해도
// 마커만 안 보이면 되므로 조용히 빈 목록으로 처리한다.
export function useNearbyHazards(center?: MapCenter | null) {
  const lat = center ? Number(center.latitude.toFixed(2)) : null;
  const lng = center ? Number(center.longitude.toFixed(2)) : null;

  return useQuery({
    queryKey: ['hazards', lat, lng],
    queryFn: async () => {
      try {
        return await fetchNearbyHazards(lat!, lng!);
      } catch {
        return [];
      }
    },
    enabled: lat !== null && lng !== null,
    placeholderData: (prev) => prev,
  });
}

export function useCourseHazards(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-hazards', courseId],
    queryFn: async () => {
      try {
        return await fetchHazardsNearCourse(courseId!);
      } catch {
        return [];
      }
    },
    enabled: !!courseId,
  });
}

export function useSubmitHazard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitHazard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] });
      queryClient.invalidateQueries({ queryKey: ['course-hazards'] });
    },
  });
}

export function useVoteHazard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'confirm' | 'resolve' }) =>
      voteHazard(id, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] });
      queryClient.invalidateQueries({ queryKey: ['course-hazards'] });
    },
  });
}
