import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchReviews,
  createReview,
  updateReview,
  deleteReview,
  REVIEWS_PAGE_SIZE,
} from '@/lib/api/reviews';

function invalidatePlaceData(queryClient: ReturnType<typeof useQueryClient>, placeId: string) {
  queryClient.invalidateQueries({ queryKey: ['reviews', placeId] });
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['places'] });
    queryClient.invalidateQueries({ queryKey: ['place', placeId] });
  }, 500);
}

// 리뷰는 20개씩 받아 "더 보기"로 이어 붙인다. 시트 안이라 중첩 스크롤이 되므로
// 무한 스크롤(onEndReached) 대신 버튼을 쓴다 — 시트 제스처와 엉키지 않는다.
export function useReviews(placeId: string | null) {
  return useInfiniteQuery({
    queryKey: ['reviews', placeId],
    queryFn: ({ pageParam }) => fetchReviews(placeId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length === REVIEWS_PAGE_SIZE ? all.length : undefined,
    enabled: !!placeId,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: (_data, variables) => {
      invalidatePlaceData(queryClient, variables.placeId);
    },
  });
}

export function useUpdateReview(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateReview,
    onSuccess: () => {
      invalidatePlaceData(queryClient, placeId);
    },
  });
}

export function useDeleteReview(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReview,
    onSuccess: () => {
      invalidatePlaceData(queryClient, placeId);
    },
  });
}
