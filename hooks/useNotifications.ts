import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchNotifications, markAllNotificationsRead } from '@/lib/api/notifications';
import { useAuthStore } from '@/stores/useAuthStore';

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: fetchNotifications,
    enabled: !!user,
    // 뱃지가 걸린 쿼리라 전역 기본(60초)보다 짧게 — 앱으로 돌아왔을 때
    // 대부분 다시 받아오도록 한다
    staleTime: 15 * 1000,
  });
}

// 지도의 벨 버튼 뱃지용 안읽음 수
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.filter((n) => !n.readAt).length ?? 0;
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });
}
