import { placeStatusLabel } from '@/components/place/OpenBadge';
import { usePlace } from '@/hooks/usePlace';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import { usePlaceOperationalStatus } from '@/hooks/usePlaceOperationalStatus';
import { looksLikeGasStation } from '@/lib/api/gasStations';
import { poiSourceKey } from '@/lib/api/placeHours';
import type { Hours } from '@/lib/hours';
import type { NavTarget } from '@/lib/navigation';

/**
 * 길안내 목적지의 영업 근거. 장소 상세와 같은 소스·같은 캐시 키를 쓴다 —
 * 등록 장소는 DB 시간표가 우선이고 없으면 구글, 일반 장소는 구글.
 * 지도에서 찍은 임의 지점·집·회사처럼 장소 id 가 없으면 조회하지 않는다.
 */
export function useArrivalHours(goal: NavTarget): { hours?: Hours | null; statusLabel?: string } {
  const { data: place } = usePlace(goal.placeId ?? null);
  const operationalStatus = usePlaceOperationalStatus(goal.placeId);
  // 주유소는 상세 시트도 구글을 묻지 않는다(대부분 24시간, 오피넷이 따로 있다)
  const general = !goal.placeId && !!goal.generalPlaceId && !looksLikeGasStation(goal.name);
  const { data: google } = usePlaceHours(
    place && !place.hours
      ? { sourceKey: `place:${place.id}`, name: place.name, latitude: place.latitude, longitude: place.longitude }
      : general
        ? { sourceKey: poiSourceKey(goal.latitude, goal.longitude), name: goal.name, latitude: goal.latitude, longitude: goal.longitude }
        : null,
  );
  return {
    hours: place?.hours ?? google?.hours,
    statusLabel: placeStatusLabel(google?.businessStatus, operationalStatus),
  };
}
