import { useQuery } from '@tanstack/react-query';

import {
  fetchNearbyGasStations,
  fetchGasStationDetail,
  fetchGasPricesAt,
  looksLikeGasStation,
  type FuelCode,
} from '@/lib/api/gasStations';

export interface SearchPoint {
  latitude: number;
  longitude: number;
}

// 수동 갱신 모델 — 지도 이동에 연동하지 않고, 필터 진입 시 1회 + "현 지도에서 재검색" 버튼으로만
// searchPoint 가 바뀐다. 기준점이 고정되니 최저가 표시도 재검색 전까지 흔들리지 않는다.
export function useGasStations(point: SearchPoint | null, enabled: boolean, prod: FuelCode = 'B027') {
  return useQuery({
    queryKey: ['gas-stations', point?.latitude, point?.longitude, prod],
    queryFn: () =>
      fetchNearbyGasStations({ latitude: point!.latitude, longitude: point!.longitude, prod }),
    enabled: enabled && !!point,
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

// 일반 장소 카드에 유가를 얹기 위한 조회 — 주유소로 보이는 이름일 때만 나간다.
export function useGasPricesAt(
  place: { name: string; latitude: number; longitude: number } | null,
) {
  return useQuery({
    queryKey: ['gas-at', place?.latitude, place?.longitude, place?.name],
    queryFn: () => fetchGasPricesAt(place!),
    enabled: !!place && looksLikeGasStation(place.name),
    staleTime: 3 * 60 * 1000,
  });
}
