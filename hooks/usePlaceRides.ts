import { useQuery } from '@tanstack/react-query';

import {
  fetchPlaceRideSummary,
  fetchMyRideStats,
  fetchMyRides,
  EMPTY_RIDE_SUMMARY,
  EMPTY_MY_RIDE_STATS,
  type PlaceRideSummary,
  type MyRideStats,
  type MyRidePlace,
} from '@/lib/api/rides';
import { useAuthStore } from '@/stores/useAuthStore';

/** 장소 누적 라이딩과 다녀간 기종 — 상세 시트용. 실시간성이 필요 없어 5분 캐시. */
export function usePlaceRideSummary(placeId: string | undefined): PlaceRideSummary {
  const { data } = useQuery({
    queryKey: ['place-rides', placeId],
    queryFn: () => fetchPlaceRideSummary(placeId!),
    enabled: !!placeId,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? EMPTY_RIDE_SUMMARY;
}

/** 내 라이딩 통계 — 내 바이크 화면의 기록 카드 */
export function useMyRideStats(): MyRideStats {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({
    queryKey: ['my-ride-stats', user?.id],
    queryFn: fetchMyRideStats,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? EMPTY_MY_RIDE_STATS;
}

/** 어디를 몇 번 갔는지 — 라이딩 기록 화면의 장소별 목록 */
export function useMyRides() {
  const user = useAuthStore((s) => s.user);
  return useQuery<MyRidePlace[]>({
    queryKey: ['my-rides', user?.id],
    queryFn: fetchMyRides,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
