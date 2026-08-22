import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchCourseLibrary,
  fetchCourseProgress,
  setCourseSaved,
  type CourseLibraryItem,
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
  const progressKey = ['course-progress', user?.id, courseId] as const;
  const libraryKey = ['course-library', user?.id] as const;
  return useMutation({
    mutationFn: (on: boolean) => setCourseSaved(courseId, on),
    onMutate: async (on) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: progressKey }),
        queryClient.cancelQueries({ queryKey: libraryKey }),
      ]);
      const previousProgress = queryClient.getQueryData<CourseProgress>(progressKey);
      const previousLibrary = queryClient.getQueryData<CourseLibraryItem[]>(libraryKey);
      queryClient.setQueryData<CourseProgress>(progressKey, {
        saved: on,
        completionCount: previousProgress?.completionCount ?? 0,
        lastCompletedAt: previousProgress?.lastCompletedAt ?? null,
      });
      // 라이브러리에 이미 있는 완주 코스는 저장 상태도 같은 프레임에 맞춘다.
      // 새 저장 코스의 전체 정보는 상세 쿼리가 소유하므로 서버 재조회로 합친다.
      if (previousLibrary) {
        queryClient.setQueryData<CourseLibraryItem[]>(
          libraryKey,
          previousLibrary
            .map((item) =>
              item.course.id === courseId
                ? { ...item, saved: on, savedAt: on ? new Date().toISOString() : null }
                : item,
            )
            .filter((item) => item.saved || item.completionCount > 0),
        );
      }
      return { previousProgress, previousLibrary };
    },
    onError: (_error, _on, context) => {
      if (!context) return;
      if (context.previousProgress) {
        queryClient.setQueryData(progressKey, context.previousProgress);
      } else {
        queryClient.removeQueries({ queryKey: progressKey, exact: true });
      }
      if (context.previousLibrary) {
        queryClient.setQueryData(libraryKey, context.previousLibrary);
      } else {
        queryClient.removeQueries({ queryKey: libraryKey, exact: true });
      }
    },
    onSuccess: (_data, on) => {
      track.courseSaved({ on });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: progressKey });
      void queryClient.invalidateQueries({ queryKey: libraryKey });
    },
  });
}
