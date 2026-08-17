import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchFavorites,
  findGeneralFavorite,
  toggleFavorite,
  toggleGeneralFavorite,
  type Favorites,
} from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { track } from '@/lib/analytics';

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
    // 탭 즉시 캐시를 토글해 별 채움이 팝 애니메이션과 동시에 일어나게 한다.
    // 실패하면 이전 목록으로 롤백하고, 성공 여부와 무관하게 서버 기준으로 재검증.
    onMutate: async (placeId: string) => {
      const key = ['favorites', user?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Favorites>(key);
      const turningOn = !prev?.placeIds.includes(placeId);
      queryClient.setQueryData<Favorites>(key, (cur) =>
        cur
          ? {
              ...cur,
              placeIds: cur.placeIds.includes(placeId)
                ? cur.placeIds.filter((id) => id !== placeId)
                : [...cur.placeIds, placeId],
            }
          : cur
      );
      // 호출부가 여러 화면이라 source 는 여기서 특정할 수 없다 — 장소 시트가
      // 사실상 유일한 진입점이라 그 기준으로 둔다.
      track.favoriteToggled({ on: turningOn, place_id: placeId, source: 'map_marker' });
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

/**
 * 일반 장소(등록 안 된 곳) 즐겨찾기 토글.
 *
 * 등록 장소와 달리 낙관적 갱신을 하지 않는다 — 서버가 만든 행 id 를 알아야
 * 목록에서 지울 수 있고, 임시 id 를 지어내면 그 사이 탭에서 어긋난다.
 */
export function useToggleGeneralFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleGeneralFavorite,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['general-place'] });
    },
  });
}

export function useIsFavorite(placeId: string) {
  const { data: favorites } = useFavorites();
  return favorites?.placeIds.includes(placeId) ?? false;
}

/** 일반 장소가 즐겨찾기인지 — 좌표 근사 일치로 본다 */
export function useIsGeneralFavorite(point: { latitude: number; longitude: number } | null) {
  const { data: favorites } = useFavorites();
  return !!favorites && !!point && !!findGeneralFavorite(favorites.general, point);
}
