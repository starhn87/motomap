import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchCourseLibrary,
  fetchCourseProgress,
  toggleCourseSave,
  type CourseProgress,
} from '@/lib/api/courseLibrary';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/useAuthStore';

export function useCourseProgress(courseId: string | null) {
  const user = useAuthStore((state) => state.user);
  return useQuery<CourseProgress>({
    queryKey: ['course-progress', user?.id, courseId],
    queryFn: () => fetchCourseProgress(courseId!),
    enabled: !!user && !!courseId,
  });
}

export function useCourseLibrary() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: ['course-library', user?.id],
    queryFn: fetchCourseLibrary,
    enabled: !!user,
  });
}

export function useToggleCourseSave(courseId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  return useMutation({
    mutationFn: () => toggleCourseSave(courseId),
    onSuccess: (saved) => {
      track.courseSaved({ on: saved });
      queryClient.setQueryData<CourseProgress>(
        ['course-progress', user?.id, courseId],
        (current) => ({
          saved,
          completionCount: current?.completionCount ?? 0,
          lastCompletedAt: current?.lastCompletedAt ?? null,
        }),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['course-library'] });
    },
  });
}
