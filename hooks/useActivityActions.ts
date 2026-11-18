import { useActivityLayoutAnimation } from './useActivityLayoutAnimation';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { deleteNotification, dismissSubmission, fetchActivityDismissals, type ActivityDismissal } from '@/lib/api/activity';
import { deleteReview } from '@/lib/api/reviews';
import type { MyReview } from '@/lib/api/mydata';
import type { AppNotification } from '@/lib/api/notifications';
import { requireUser } from '@/lib/auth';
import { toast } from '@/lib/toast';

export function useActivityDismissals(active: boolean) {
  const user = useAuthStore(state => state.user);
  return useQuery({ queryKey: ['activity-dismissals', user?.id], queryFn: () => fetchActivityDismissals(user!.id), enabled: !!user && active });
}

export function useDismissSubmission() {
  const client = useQueryClient();
  const animateChange = useActivityLayoutAnimation();
  return useMutation({
    mutationFn: dismissSubmission,
    onMutate: async params => {
      const key = ['activity-dismissals', params.userId];
      await client.cancelQueries({ queryKey: key });
      animateChange();
      client.setQueryData<ActivityDismissal[]>(key, current => [...(current ?? []).filter(row => row.kind !== params.kind || row.target_id !== params.id),
        { kind: params.kind, target_id: params.id }]);
    },
    onError: (_error, params) => {
      // 실패한 한 행만 복원한다. 다른 스와이프의 성공 결과는 되돌리지 않는다.
      animateChange();
      client.setQueryData<ActivityDismissal[]>(['activity-dismissals', params.userId], current => current?.filter(row => row.kind !== params.kind || row.target_id !== params.id));
      toast.error('목록에서 삭제하지 못했어요. 다시 시도해 주세요.');
    },
    onSettled: (_data, _error, params) => { void client.invalidateQueries({ queryKey: ['activity-dismissals', params.userId] }); },
  });
}

export function useDeleteActivityNotification() {
  const client = useQueryClient();
  const animateChange = useActivityLayoutAnimation();
  return useMutation({
    mutationFn: deleteNotification,
    onMutate: async params => {
      const key = ['notifications', params.userId];
      await client.cancelQueries({ queryKey: key });
      const removed = client.getQueryData<AppNotification[]>(key)?.find(row => row.id === params.id);
      animateChange();
      client.setQueryData<AppNotification[]>(key, current => current?.filter(row => row.id !== params.id));
      return { removed };
    },
    onError: (_error, params, context) => {
      if (context?.removed) animateChange();
      if (context?.removed) client.setQueryData<AppNotification[]>(['notifications', params.userId], current =>
        [...(current ?? []).filter(row => row.id !== params.id), context.removed!].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      toast.error('알림을 삭제하지 못했어요. 다시 시도해 주세요.');
    },
    onSettled: (_data, _error, params) => { void client.invalidateQueries({ queryKey: ['notifications', params.userId] }); },
  });
}

export function useDeleteActivityReview() {
  const client = useQueryClient();
  const animateChange = useActivityLayoutAnimation();
  return useMutation({
    mutationFn: async ({ review, userId }: { review: MyReview; userId: string }) => {
      if ((await requireUser()).id !== userId) throw new Error('계정이 변경됐어요.');
      await deleteReview(review.id);
    },
    onMutate: async ({ review, userId }) => {
      const key = ['my-reviews', userId];
      await client.cancelQueries({ queryKey: key });
      const current = client.getQueryData<InfiniteData<MyReview[]>>(key);
      const page = current?.pages.findIndex(rows => rows.some(row => row.id === review.id)) ?? -1;
      const index = page >= 0 ? current!.pages[page].findIndex(row => row.id === review.id) : -1;
      animateChange();
      client.setQueryData<InfiniteData<MyReview[]>>(key, data => data ? { ...data, pages: data.pages.map(rows => rows.filter(row => row.id !== review.id)) } : data);
      return { page, index };
    },
    onError: (_error, { review, userId }, context) => {
      if (context && context.page >= 0) animateChange();
      if (context && context.page >= 0) client.setQueryData<InfiniteData<MyReview[]>>(['my-reviews', userId], data => data ? {
        ...data, pages: data.pages.map((rows, index) => {
          if (index !== context.page || rows.some(row => row.id === review.id)) return rows;
          const restored = [...rows]; restored.splice(context.index, 0, review); return restored;
        }),
      } : data);
      toast.error('리뷰를 삭제하지 못했어요. 다시 시도해 주세요.');
    },
    onSettled: (_data, _error, { review, userId }) => {
      void client.invalidateQueries({ queryKey: ['my-reviews', userId] });
      void client.invalidateQueries({ queryKey: ['reviews', review.targetKind, review.placeId] });
      void client.invalidateQueries({ queryKey: ['places'] });
      void client.invalidateQueries({ queryKey: ['place', review.placeId] });
      void client.invalidateQueries({ queryKey: ['general-place'] });
    },
  });
}
