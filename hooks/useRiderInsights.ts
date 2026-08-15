import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { BIKE_SPECS, canonicalBikeModel } from '@/constants/bikes';
import type { RiderFactCode } from '@/constants/riderFacts';
import {
  fetchBikePlaceMatches,
  fetchPlaceRiderFacts,
  togglePlaceRiderFact,
  type RiderPlaceFact,
} from '@/lib/api/riderInsights';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserBikes } from '@/hooks/useUserBikes';

export function usePlaceRiderFacts(placeId: string | undefined) {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: ['place-rider-facts', placeId, user?.id ?? 'anonymous'],
    queryFn: () => fetchPlaceRiderFacts(placeId!),
    enabled: !!placeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTogglePlaceRiderFact(placeId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const key = ['place-rider-facts', placeId, user?.id ?? 'anonymous'];

  return useMutation({
    mutationFn: (code: RiderFactCode) => togglePlaceRiderFact(placeId, code),
    onMutate: async (code) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RiderPlaceFact[]>(key) ?? [];
      const current = previous.find((fact) => fact.code === code);
      const next = current
        ? previous.map((fact) =>
            fact.code === code
              ? {
                  ...fact,
                  confirmations: Math.max(0, fact.confirmations + (fact.confirmedByMe ? -1 : 1)),
                  confirmedByMe: !fact.confirmedByMe,
                }
              : fact,
          )
        : [...previous, { code, confirmations: 1, confirmedByMe: true }];
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (_error, _code, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useBikePlaceMatches(placeIds: string[]) {
  const user = useAuthStore((state) => state.user);
  const bikes = useUserBikes();
  const activeBike = bikes.data?.find((bike) => bike.isActive) ?? null;
  const bikeKey = activeBike
    ? canonicalBikeModel(activeBike.model) ?? activeBike.model.trim()
    : null;
  const bikeCategory = bikeKey ? BIKE_SPECS[bikeKey]?.category : undefined;
  const stableIds = [...new Set(placeIds)].sort();

  const query = useQuery({
    queryKey: [
      'bike-place-matches',
      user?.id,
      activeBike?.id,
      activeBike?.model,
      bikeCategory ?? null,
      stableIds.join(','),
    ],
    queryFn: () => fetchBikePlaceMatches(stableIds, bikeCategory),
    enabled: !!user && !!activeBike && stableIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    activeBike,
    bikesLoading: bikes.isLoading,
  };
}
