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

  return useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useIsFavorite(placeId: string) {
  const { data: favorites } = useFavorites();
  return favorites?.includes(placeId) ?? false;
}
