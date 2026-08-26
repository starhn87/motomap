import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchFavorites,
  fetchFavoritePlaces,
  findGeneralFavorite,
  setFavorite,
  setGeneralFavorite,
  type Favorites,
  type GeneralFavorite,
  type GeneralFavoriteChange,
} from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { track } from '@/lib/analytics';
import { queryKeys } from '@/lib/queryKeys';

export function useFavorites() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: queryKeys.favorites.summary(user?.id),
    queryFn: fetchFavorites,
    enabled: !!user,
  });
}

export function useFavoritePlaces(enabled = true) {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: queryKeys.favorites.places(user?.id),
    queryFn: fetchFavoritePlaces,
    enabled: enabled && !!user,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: ({ placeId, on }: { placeId: string; on: boolean }) =>
      setFavorite(placeId, on),
    // 탭 즉시 캐시를 토글해 별 채움이 팝 애니메이션과 동시에 일어나게 한다.
    // 실패하면 이전 목록으로 롤백하고, 성공 여부와 무관하게 서버 기준으로 재검증.
    onMutate: async ({ placeId, on }) => {
      const key = queryKeys.favorites.summary(user?.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Favorites>(key);
      const current = prev ?? { placeIds: [], general: [] };
      queryClient.setQueryData<Favorites>(key, {
        ...current,
        placeIds: on
          ? [...new Set([...current.placeIds, placeId])]
          : current.placeIds.filter((id) => id !== placeId),
      });
      return { key, prev };
    },
    onError: (_error, _placeId, context) => {
      if (!context) return;
      if (context.prev) queryClient.setQueryData(context.key, context.prev);
      else queryClient.removeQueries({ queryKey: context.key, exact: true });
    },
    onSuccess: (_data, { placeId, on }) => {
      track.favoriteToggled({ on, place_id: placeId, source: 'map_marker' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });
}

export function useToggleGeneralFavorite() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: setGeneralFavorite,
    onMutate: async ({ place, on }: GeneralFavoriteChange) => {
      const key = queryKeys.favorites.summary(user?.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Favorites>(key);
      const current = prev ?? { placeIds: [], general: [] };
      const withoutTarget = current.general.filter(
        (favorite) => !findGeneralFavorite([favorite], place),
      );
      const optimistic: GeneralFavorite = {
        id: `optimistic-${place.providerId ?? `${place.latitude},${place.longitude}`}`,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        phone: place.phone,
        providerId: place.providerId,
        placeUrl: place.placeUrl,
      };
      queryClient.setQueryData<Favorites>(key, {
        ...current,
        general: on ? [...withoutTarget, optimistic] : withoutTarget,
      });
      return { key, prev };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.prev) queryClient.setQueryData(context.key, context.prev);
      else queryClient.removeQueries({ queryKey: context.key, exact: true });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
      queryClient.invalidateQueries({ queryKey: ['general-place'] });
    },
  });
}

export function useIsFavorite(placeId: string) {
  const { data: favorites } = useFavorites();
  return favorites?.placeIds.includes(placeId) ?? false;
}

/** 일반 장소 즐겨찾기 행 — 좌표 근사 일치로 본다. */
export function useGeneralFavorite(point: { latitude: number; longitude: number } | null) {
  const { data: favorites } = useFavorites();
  return favorites && point ? findGeneralFavorite(favorites.general, point) : undefined;
}

export function useIsGeneralFavorite(point: { latitude: number; longitude: number } | null) {
  return !!useGeneralFavorite(point);
}
