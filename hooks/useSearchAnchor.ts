import { useMapStore } from '@/stores/useMapStore';

export interface SearchAnchor {
  /** 검색을 우선할 좌표 — 마지막으로 본 지도 중심, 없으면 내 위치 */
  near: { latitude: number; longitude: number } | undefined;
  /** react-query 캐시 키용 근사값(±1km) — 미세한 지도 이동마다 재검색하지 않는다 */
  key: string;
}

function toAnchor(
  mapCenter: { latitude: number; longitude: number } | null,
  userLocation: { latitude: number; longitude: number } | null,
): SearchAnchor {
  const near = mapCenter ?? userLocation ?? undefined;
  return {
    near,
    key: near ? `${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}` : 'none',
  };
}

/** 검색 기준점 — 세 검색 화면(통합 검색·검색 결과·지점 모달)이 같은 기준을 쓴다. */
export function useSearchAnchor(): SearchAnchor {
  const mapCenter = useMapStore((s) => s.mapCenter);
  const userLocation = useMapStore((s) => s.userLocation);
  return toAnchor(mapCenter, userLocation);
}

/** 훅을 못 쓰는 문맥(디바운스 콜백 등)용 — 같은 규칙의 1회성 스냅샷 */
export function getSearchAnchor(): SearchAnchor {
  const s = useMapStore.getState();
  return toAnchor(s.mapCenter, s.userLocation);
}
