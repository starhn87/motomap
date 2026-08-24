import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchGeneralPlaceShare,
  toggleGeneralPlaceShare,
  type GeneralPlaceShareState,
} from '@/lib/api/communityPlaceSignals';
import {
  fetchSharedGeneralPlaces,
  generalPlaceIdentity,
  type GeneralPlaceBounds,
  type GeneralPlaceInput,
} from '@/lib/api/generalPlaces';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/useAuthStore';
import { MAP_WINDOW_OVERSCAN, type MapCenter } from '@/hooks/usePlaces';

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

function sharedGeneralPlaceBounds(center: MapCenter | null): GeneralPlaceBounds | null {
  const region = center?.region;
  if (!region || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return null;
  const latitude = region.latitude + region.latitudeDelta / 2;
  const longitude = region.longitude + region.longitudeDelta / 2;
  const latitudeMargin = (region.latitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  const longitudeMargin = (region.longitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  return {
    south: latitude - latitudeMargin,
    west: longitude - longitudeMargin,
    north: latitude + latitudeMargin,
    east: longitude + longitudeMargin,
  };
}

export function useSharedGeneralPlaces(center: MapCenter | null, enabled: boolean) {
  const bounds = sharedGeneralPlaceBounds(center);
  const boundsKey = bounds
    ? [bounds.south, bounds.west, bounds.north, bounds.east]
        .map((value) => value.toFixed(3))
        .join(',')
    : 'all';
  return useQuery({
    queryKey: ['shared-general-places', boundsKey],
    queryFn: () => fetchSharedGeneralPlaces(bounds),
    enabled,
    placeholderData: (previous) => previous,
    staleTime: 2 * 60 * 1000,
  });
}
