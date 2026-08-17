import { useQuery } from '@tanstack/react-query';

import {
  findGeneralPlace,
  generalPlaceQueryKey,
  type GeneralPlaceInput,
} from '@/lib/api/generalPlaces';

export function useGeneralPlace(place: GeneralPlaceInput | null) {
  return useQuery({
    queryKey: place ? generalPlaceQueryKey(place) : ['general-place', 'none'],
    queryFn: () => findGeneralPlace(place!),
    enabled: !!place,
  });
}
