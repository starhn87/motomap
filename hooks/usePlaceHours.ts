import { useQuery } from '@tanstack/react-query';

import { fetchPlaceHours } from '@/lib/api/placeHours';

/**
 * 우리 DB 에 없는 장소의 영업시간. 서버가 30일 캐시를 들고 있으므로 여기서는
 * 세션 동안만 안 물어보면 충분하다.
 */
export function usePlaceHours(
  params: { sourceKey: string; name: string; latitude: number; longitude: number } | null,
) {
  return useQuery({
    queryKey: ['place-hours', params?.sourceKey],
    queryFn: () => fetchPlaceHours(params!),
    enabled: !!params,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
