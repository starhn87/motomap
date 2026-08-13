import { useEffect, useState } from 'react';

import { useGasStations, type GasSearchSpec } from '@/hooks/useGasStations';
import { approxMeters } from '@/lib/distance';
import type { GasStation } from '@/lib/api/gasStations';

interface MapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}

// 지도 홈의 오피넷 유가 레이어 — 수동 갱신 모델(필터 진입 1회 + "현 지도에서
// 재검색" 버튼)의 상태 일체를 맡는다. 검색 커버리지는 그 시점의 화면 영역을
// 따른다: 확대하면 좁고 정확하게, 축소하면 5km 원 격자로 화면을 채운다
// (계산은 useGasStations).
export function useGasLayer(args: {
  /** 주유소 필터가 켜져 있는가 */
  active: boolean;
  mapCenter: MapCamera | null;
  mapReady: boolean;
  screenWidth: number;
  screenHeight: number;
}) {
  const { active, mapCenter, mapReady, screenWidth, screenHeight } = args;
  const [selectedStation, setSelectedStation] = useState<GasStation | null>(null);
  const [searchSpec, setSearchSpec] = useState<GasSearchSpec | null>(null);
  const { data: gasStations, isFetching: gasFetching } = useGasStations(
    searchSpec,
    active && mapReady,
  );

  // 필터 진입 시 현재 화면 기준으로 최초 1회 검색, 필터를 벗어나면 초기화
  useEffect(() => {
    if (!active) {
      setSelectedStation(null);
      setSearchSpec(null);
      return;
    }
    if (!searchSpec && mapCenter) {
      setSearchSpec({ ...mapCenter, widthDp: screenWidth, heightDp: screenHeight });
    }
  }, [active, searchSpec, mapCenter, screenWidth, screenHeight]);

  // 검색된 마커는 줌아웃해도 유지한다 — 기준점(searchSpec)이 바뀔 때만 갱신
  const stations = active ? (gasStations ?? []) : [];
  // 최저가 표시는 딱 하나 — 가격순(sort=1) 응답에서 최저가와 동가인 것 중 가장 가까운 곳
  const cheapestId = stations.length
    ? stations
        .filter((s) => s.price === stations[0].price)
        .reduce((a, b) => (a.distance <= b.distance ? a : b)).id
    : null;
  // 기준점에서 충분히 움직였거나 줌이 바뀌어(커버 영역이 달라짐) 재검색 버튼 노출
  const moved =
    active && searchSpec && mapCenter
      ? approxMeters(mapCenter, searchSpec) > 300 ||
        Math.abs(mapCenter.zoom - searchSpec.zoom) > 0.5
      : false;
  const showGasRefresh = active && !!searchSpec && (moved || gasFetching);

  // "현 지도에서 재검색" — 열려 있는 카드를 닫고 스냅샷을 현재 화면으로 교체
  const refreshHere = () => {
    if (!mapCenter) return;
    setSelectedStation(null);
    setSearchSpec({ ...mapCenter, widthDp: screenWidth, heightDp: screenHeight });
  };

  return {
    stations,
    cheapestId,
    gasFetching,
    showGasRefresh,
    selectedStation,
    setSelectedStation,
    refreshHere,
  };
}
