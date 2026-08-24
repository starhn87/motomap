import { useQuery } from '@tanstack/react-query';

import {
  fetchRidingGuideById,
  fetchRidingGuideIdByLegacyCourseId,
  fetchRidingGuides,
} from '@/lib/api/ridingGuides';

export function useRidingGuides() {
  return useQuery({
    queryKey: ['riding-guides'],
    queryFn: fetchRidingGuides,
  });
}

export function useRidingGuide(id: string | null) {
  return useQuery({
    queryKey: ['riding-guides', 'detail', id],
    queryFn: () => fetchRidingGuideById(id!),
    enabled: !!id,
  });
}

export function useLegacyCourseGuide(courseId: string | null) {
  return useQuery({
    queryKey: ['riding-guides', 'legacy-course', courseId],
    queryFn: () => fetchRidingGuideIdByLegacyCourseId(courseId!),
    enabled: !!courseId,
  });
}
