import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchFavorites, toggleFavorite } from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';

export function useFavorites() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: fetchFavorites,
    enabled: !!user,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: toggleFavorite,
    // 탭 즉시 캐시를 토글해 하트 채움이 팝 애니메이션과 동시에 일어나게 한다.
    // 실패하면 이전 목록으로 롤백하고, 성공 여부와 무관하게 서버 기준으로 재검증.
    onMutate: async (placeId: string) => {
      const key = ['favorites', user?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (cur) =>
        cur?.includes(placeId) ? cur.filter((id) => id !== placeId) : [...(cur ?? []), placeId]
      );
      return { key, prev };
    },
    onError: (_error, _placeId, context) => {
      if (context) queryClient.setQueryData(context.key, context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useIsFavorite(placeId: string) {
  const { data: favorites } = useFavorites();
  return favorites?.includes(placeId) ?? false;
}
