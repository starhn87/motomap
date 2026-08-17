import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchReviews,
  createReview,
  updateReview,
  deleteReview,
  toggleReviewLike,
  REVIEWS_PAGE_SIZE,
  type ReviewTarget,
} from '@/lib/api/reviews';

function reviewKey(target: ReviewTarget | null) {
  return ['reviews', target?.kind ?? 'none', target?.id ?? null] as const;
}

function invalidateTargetData(
  queryClient: ReturnType<typeof useQueryClient>,
  target: ReviewTarget,
) {
  queryClient.invalidateQueries({ queryKey: reviewKey(target) });
  setTimeout(() => {
    if (target.kind === 'place') {
      queryClient.invalidateQueries({ queryKey: ['places'] });
      queryClient.invalidateQueries({ queryKey: ['place', target.id] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['general-place'] });
    }
  }, 500);
}

// 리뷰는 20개씩 받아 "더 보기"로 이어 붙인다. 시트 안이라 중첩 스크롤이 되므로
// 무한 스크롤(onEndReached) 대신 버튼을 쓴다 — 시트 제스처와 엉키지 않는다.
export function useReviews(target: ReviewTarget | null) {
  return useInfiniteQuery({
    queryKey: reviewKey(target),
    queryFn: ({ pageParam }) => fetchReviews(target!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length === REVIEWS_PAGE_SIZE ? all.length : undefined,
    enabled: !!target,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: (target) => {
      invalidateTargetData(queryClient, target);
    },
  });
}

export function useUpdateReview(target: ReviewTarget) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateReview,
    onSuccess: () => {
      invalidateTargetData(queryClient, target);
    },
  });
}

export function useDeleteReview(target: ReviewTarget) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReview,
    onSuccess: () => {
      invalidateTargetData(queryClient, target);
    },
  });
}

// 좋아요 토글 — 탭 즉시 반응해야 하므로 캐시를 낙관적으로 바꾸고,
// 실패하면 되돌린다(즐겨찾기 하트와 같은 방식).
export function useToggleReviewLike(target: ReviewTarget | null) {
  const queryClient = useQueryClient();
  const key = reviewKey(target);

  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) => toggleReviewLike(id, liked),
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (cur: any) =>
        cur
          ? {
              ...cur,
              pages: cur.pages.map((page: any[]) =>
                page.map((r) =>
                  r.id === id
                    ? {
                        ...r,
                        likedByMe: !liked,
                        likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)),
                      }
                    : r
                )
              ),
            }
          : cur
      );
      return { prev };
    },
    onError: (_e, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(key, context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
