import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchGeneralPlaceShare,
  fetchPlaceRecommendation,
  fetchTopRecommendedPlaces,
  toggleGeneralPlaceShare,
  togglePlaceRecommendation,
  type GeneralPlaceShareState,
  type PlaceRecommendationState,
} from '@/lib/api/communityPlaceSignals';
import { generalPlaceIdentity, type GeneralPlaceInput } from '@/lib/api/generalPlaces';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/useAuthStore';

function placeRecommendationKey(placeId: string | undefined, userId: string | undefined) {
  return ['place-recommendation', placeId ?? null, userId ?? 'anonymous'] as const;
}

function generalPlaceShareKey(place: GeneralPlaceInput | null, userId: string | undefined) {
  if (!place) return ['general-place-share', 'none', userId ?? 'anonymous'] as const;
  const identity = generalPlaceIdentity(place);
  return [
    'general-place-share',
    identity.provider,
    identity.providerId,
    userId ?? 'anonymous',
  ] as const;
}

export function usePlaceRecommendation(placeId: string | undefined) {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: placeRecommendationKey(placeId, user?.id),
    queryFn: () => fetchPlaceRecommendation(placeId!),
    enabled: !!placeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTogglePlaceRecommendation(placeId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const key = placeRecommendationKey(placeId, user?.id);

  return useMutation({
    mutationFn: () => togglePlaceRecommendation(placeId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlaceRecommendationState>(key);
      const current = previous ?? { count: 0, recommendedByMe: false };
      const nextOn = !current.recommendedByMe;
      queryClient.setQueryData<PlaceRecommendationState>(key, {
        count: Math.max(0, current.count + (nextOn ? 1 : -1)),
        recommendedByMe: nextOn,
      });
      return { previous, nextOn };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      else queryClient.removeQueries({ queryKey: key, exact: true });
    },
    onSuccess: (on) => track.placeRecommendationToggled({ on }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['top-recommended-places'] });
    },
  });
}

export function useGeneralPlaceShare(place: GeneralPlaceInput | null) {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: generalPlaceShareKey(place, user?.id),
    queryFn: () => fetchGeneralPlaceShare(place!),
    enabled: !!place,
    staleTime: 2 * 60 * 1000,
  });
}

export function useToggleGeneralPlaceShare(place: GeneralPlaceInput | null) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const key = generalPlaceShareKey(place, user?.id);

  return useMutation({
    mutationFn: () => toggleGeneralPlaceShare(place!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GeneralPlaceShareState>(key);
      const current = previous ?? { count: 0, sharedByMe: false, generalPlaceId: null };
      const nextOn = !current.sharedByMe;
      queryClient.setQueryData<GeneralPlaceShareState>(key, {
        ...current,
        count: Math.max(0, current.count + (nextOn ? 1 : -1)),
        sharedByMe: nextOn,
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      else queryClient.removeQueries({ queryKey: key, exact: true });
    },
    onSuccess: ({ shared, generalPlaceId }) => {
      track.generalPlaceShareToggled({ on: shared });
      queryClient.setQueryData<GeneralPlaceShareState>(key, (current) =>
        current ? { ...current, generalPlaceId } : current,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['general-place'] });
      queryClient.invalidateQueries({ queryKey: ['shared-general-places'] });
    },
  });
}

export function useTopRecommendedPlaces() {
  return useQuery({
    queryKey: ['top-recommended-places'],
    queryFn: fetchTopRecommendedPlaces,
    staleTime: 5 * 60 * 1000,
  });
}
