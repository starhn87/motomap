import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useMapStore } from '@/stores/useMapStore';

/**
 * 위치·방향 센서 갱신을 지도 전체 렌더 트리에서 격리한다.
 * 방향은 짧은 간격으로 바뀌지만 정적 장소 마커를 다시 계산할 이유는 없다.
 */
export function TrackedUserLocationMarker() {
  const userLocation = useMapStore((state) => state.userLocation);
  const { heading } = useUserLocation();

  if (!userLocation) return null;

  return (
    <UserLocationMarker
      latitude={userLocation.latitude}
      longitude={userLocation.longitude}
      heading={heading}
    />
  );
}
