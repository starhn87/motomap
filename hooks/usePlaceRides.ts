import { useQuery } from '@tanstack/react-query';

import { fetchPlaceRideCount } from '@/lib/api/rides';

/** 장소 누적 라이딩 횟수 — 상세 시트 표시용. 실시간성이 필요 없어 5분 캐시. */
export function usePlaceRideCount(placeId: string | undefined): number {
  const { data } = useQuery({
    queryKey: ['place-rides', placeId],
    queryFn: () => fetchPlaceRideCount(placeId!),
    enabled: !!placeId,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? 0;
}
