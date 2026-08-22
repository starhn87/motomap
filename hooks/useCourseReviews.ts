import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchCourseReviews,
  createCourseReview,
  updateCourseReview,
  deleteCourseReview,
} from '@/lib/api/courseReviews';
import type { Review } from '@/types';

function invalidateCourseData(queryClient: ReturnType<typeof useQueryClient>, courseId: string) {
  queryClient.invalidateQueries({ queryKey: ['course-reviews', courseId] });
  // 트리거가 DB를 갱신하는 시간을 위해 약간의 딜레이 후 코스 데이터 refetch
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['courses'] });
    queryClient.invalidateQueries({ queryKey: ['courses', 'detail', courseId] });
  }, 500);
}

export function useCourseReviews(courseId: string | null) {
  return useQuery({
    queryKey: ['course-reviews', courseId],
    queryFn: () => fetchCourseReviews(courseId!),
    enabled: !!courseId,
  });
}

export function useCreateCourseReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCourseReview,
    onSuccess: (_data, variables) => {
      invalidateCourseData(queryClient, variables.courseId);
    },
  });
}

export function useUpdateCourseReview(courseId: string) {
  const queryClient = useQueryClient();
  const key = ['course-reviews', courseId] as const;

  return useMutation({
    mutationFn: updateCourseReview,
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Review[]>(key);
      queryClient.setQueryData<Review[]>(key, (current) =>
        current?.map((review) =>
          review.id === params.id
            ? { ...review, rating: params.rating, content: params.content }
            : review,
        ),
      );
      return { previous };
    },
    onError: (_error, _params, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      invalidateCourseData(queryClient, courseId);
    },
  });
}

export function useDeleteCourseReview(courseId: string) {
  const queryClient = useQueryClient();
  const key = ['course-reviews', courseId] as const;

  return useMutation({
    mutationFn: deleteCourseReview,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Review[]>(key);
      queryClient.setQueryData<Review[]>(key, (current) =>
        current?.filter((review) => review.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      invalidateCourseData(queryClient, courseId);
    },
  });
}
