import { useQuery } from '@tanstack/react-query';

import { fetchActivePlaceOperationalStatuses } from '@/lib/api/placeOperationalStatus';

export function usePlaceOperationalStatuses(enabled = true) {
  return useQuery({
    queryKey: ['places', 'operational-statuses'],
    queryFn: fetchActivePlaceOperationalStatuses,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function usePlaceOperationalStatus(placeId: string | undefined) {
  const { data } = usePlaceOperationalStatuses(!!placeId);
  return placeId ? data?.[placeId] : undefined;
}
