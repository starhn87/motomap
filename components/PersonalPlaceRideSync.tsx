import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { syncPersonalPlaceRideExclusions } from '@/lib/api/rides';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';

function placesSignature(
  places: ReturnType<typeof useMyPlacesStore.getState>['places'],
): string {
  return (['home', 'work'] as const)
    .map((slot) => {
      const place = places[slot];
      return place ? `${slot}:${place.latitude}:${place.longitude}` : `${slot}:-`;
    })
    .join('|');
}

/**
 * 로그인과 로컬 집·회사가 준비되면 과거 목적지 통계를 한 번 보정한다. 좌표는
 * 서버로 보내지 않고 내려받은 본인 기록과 기기에서 비교한다.
 */
export default function PersonalPlaceRideSync() {
  const user = useAuthStore((state) => state.user);
  const places = useMyPlacesStore((state) => state.places);
  const loaded = useMyPlacesStore((state) => state.loaded);
  const load = useMyPlacesStore((state) => state.load);
  const signature = placesSignature(places);

  useEffect(() => {
    void load();
  }, [load]);

  useQuery({
    queryKey: ['personal-place-ride-sync', user?.id, signature],
    queryFn: async () => {
      const updated = await syncPersonalPlaceRideExclusions(places);
      if (updated > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['my-ride-stats'] }),
          queryClient.invalidateQueries({ queryKey: ['my-rides'] }),
          queryClient.invalidateQueries({ queryKey: ['place-rides'] }),
          queryClient.invalidateQueries({ queryKey: ['bike-place-matches'] }),
        ]);
      }
      return updated;
    },
    enabled: !!user && loaded,
    staleTime: Infinity,
  });

  return null;
}
