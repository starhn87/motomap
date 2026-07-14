import { useQuery } from '@tanstack/react-query';

import {
  fetchNearbyGasStations,
  fetchGasStationDetail,
  type FuelCode,
} from '@/lib/api/gasStations';

// 오피넷 반경 상한이 5km 라, 너무 축소된 지도에서는 조회 의미가 없다 — 이 줌 미만이면 비활성
export const GAS_MIN_ZOOM = 11.5;

interface MapCenter {
  latitude: number;
  longitude: number;
  zoom: number;
}

export function useGasStations(center: MapCenter | null, enabled: boolean, prod: FuelCode = 'B027') {
  // 카메라 미세 이동마다 리페치하지 않도록 ~1km 격자로 좌표를 뭉친다 (서버 캐시 키와 동일 단위)
  const lat = center ? Number(center.latitude.toFixed(2)) : null;
  const lng = center ? Number(center.longitude.toFixed(2)) : null;

  return useQuery({
    queryKey: ['gas-stations', lat, lng, prod],
    queryFn: () => fetchNearbyGasStations({ latitude: lat!, longitude: lng!, prod }),
    enabled: enabled && lat !== null && lng !== null,
    staleTime: 3 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useGasStationDetail(id: string | null) {
  return useQuery({
    queryKey: ['gas-station', id],
    queryFn: () => fetchGasStationDetail(id!),
    enabled: !!id,
    staleTime: 3 * 60 * 1000,
  });
}
