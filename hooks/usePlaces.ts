import { useQuery } from '@tanstack/react-query';

import { fetchNearbyPlaces, fetchAllPlaces } from '@/lib/api/places';
import type { Place, PlaceCategory } from '@/types';

interface MapCenter {
  latitude: number;
  longitude: number;
  zoom: number;
}

// 줌 레벨 → 반경(m) 변환
// 줌 레벨이 높을수록(확대) 반경 작게, 낮을수록(축소) 반경 크게
function zoomToRadius(zoom: number): number {
  // 줌 10 → ~39km, 줌 14 → ~2.4km, 줌 18 → ~0.2km
  return Math.round(40000000 / Math.pow(2, zoom));
}

// 축소 뷰에서 반경이 수백 km 로 폭주해 사실상 전 테이블 거리 계산이 되는 것을 막는다
const MAX_RADIUS_M = 150_000;

function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function usePlaces(
  category?: PlaceCategory | null,
  center?: MapCenter | null,
  enabled = true,
) {
  // 좌표·줌을 원값 그대로 캐시 키에 넣으면 지도를 조금만 움직여도 키가 달라져
  // 캐시가 무력화된다(staleTime 이 있어도 매번 RPC). 줌은 0.5 스텝, 좌표는
  // 반경의 1/4 격자로 스냅해 인접 이동은 같은 키 → 캐시 히트가 되게 한다.
  const snappedZoom = center ? Math.round(center.zoom * 2) / 2 : null;
  const baseRadius = snappedZoom !== null ? Math.min(zoomToRadius(snappedZoom), MAX_RADIUS_M) : 100000;
  const grid = baseRadius / 4;
  const lat = center ? snap(center.latitude, grid / 111_000) : null;
  const lng = center ? snap(center.longitude, grid / 88_000) : null;
  // 스냅으로 중심이 최대 격자 반 칸 어긋나므로 반경에 여유를 더해 가장자리 누락을 막는다
  const radius = Math.round(baseRadius * 1.3);

  return useQuery({
    queryKey: ['places', lat, lng, radius, category],
    queryFn: () =>
      lat !== null && lng !== null
        ? fetchNearbyPlaces({
            latitude: lat,
            longitude: lng,
            radiusMeters: radius,
            category,
          })
        : fetchAllPlaces(category),
    placeholderData: (prev) => prev,
    enabled,
  });
}

export interface RecommendedPlaces {
  recent: Place[];
  topRated: Place[];
}

// 추천 목적지 — 기존 장소 DB를 재사용 (새로 등록된 곳 + 고평점)
export function useRecommendedPlaces() {
  return useQuery({
    queryKey: ['places', 'recommended'],
    queryFn: () => fetchAllPlaces(null),
    select: (places: Place[]): RecommendedPlaces => ({
      recent: [...places]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 8),
      topRated: [...places]
        .filter((p) => p.reviewCount > 0)
        .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
        .slice(0, 8),
    }),
  });
}
