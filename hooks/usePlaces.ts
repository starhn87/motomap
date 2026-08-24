import { useQuery } from '@tanstack/react-query';

import { fetchNearbyPlaces, fetchAllPlaces } from '@/lib/api/places';
import type { Place, PlaceCategory } from '@/types';
import { regionOf } from '@/lib/region';

export interface MapCenter {
  latitude: number;
  longitude: number;
  zoom: number;
  region?: {
    // 네이버 지도 SDK의 region 좌표는 중심이 아니라 남서쪽 모서리다.
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

// 실제 화면보다 가로·세로를 50% 넓게 유지해 드래그 중 가장자리 마커가
// 뒤늦게 나타나는 것을 줄인다. 카메라가 멈출 때만 이 창을 갱신한다.
export const MAP_WINDOW_OVERSCAN = 1.5;

const METERS_PER_LATITUDE_DEGREE = 111_320;

function longitudeMetersPerDegree(latitude: number): number {
  return METERS_PER_LATITUDE_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

export function mapRenderWindowRadius(center: MapCenter): number | null {
  const region = center.region;
  if (!region || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return null;

  const halfHeight = (region.latitudeDelta / 2) * METERS_PER_LATITUDE_DEGREE;
  const regionCenterLatitude = region.latitude + region.latitudeDelta / 2;
  const halfWidth =
    (region.longitudeDelta / 2) * longitudeMetersPerDegree(regionCenterLatitude);
  return Math.hypot(halfHeight, halfWidth) * MAP_WINDOW_OVERSCAN;
}

export function isInMapRenderWindow(
  coordinate: Coordinate,
  center?: MapCenter | null,
): boolean {
  const region = center?.region;
  if (!region || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return true;

  // region.latitude/longitude는 남서쪽 모서리다. 이를 그대로 중심으로 쓰면
  // 실제 화면의 북쪽·동쪽 25%가 1.5배 overscan 창에서도 빠진다.
  const regionCenterLatitude = region.latitude + region.latitudeDelta / 2;
  const regionCenterLongitude = region.longitude + region.longitudeDelta / 2;
  const latitudeMargin = (region.latitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  const longitudeMargin = (region.longitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  return (
    Math.abs(coordinate.latitude - regionCenterLatitude) <= latitudeMargin &&
    Math.abs(coordinate.longitude - regionCenterLongitude) <= longitudeMargin
  );
}

// 줌 레벨 → 반경(m) 변환
// 줌 레벨이 높을수록(확대) 반경 작게, 낮을수록(축소) 반경 크게
function zoomToRadius(zoom: number): number {
  // 줌 10 → ~39km, 줌 14 → ~2.4km, 줌 18 → ~0.2km
  return Math.round(40000000 / Math.pow(2, zoom));
}

// 실제 화면 창이 이보다 넓으면 거대한 거리 연산 대신 작은 현재 장소 테이블을 한 번 읽는다.
const ALL_PLACES_RADIUS_THRESHOLD_M = 195_000;
const MAX_FALLBACK_RADIUS_M = 150_000;

function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function usePlaces(
  category?: PlaceCategory | null,
  center?: MapCenter | null,
  enabled = true,
) {
  // 실제 화면의 모서리를 포함하는 원에 50% windowing 여유를 더한다. region 이
  // 아직 없는 첫 프레임만 줌 추정치를 사용한다.
  const snappedZoom = center ? Math.round(center.zoom * 2) / 2 : null;
  const fallbackRadius =
    snappedZoom !== null
      ? Math.min(zoomToRadius(snappedZoom), MAX_FALLBACK_RADIUS_M)
      : 100_000;
  const baseRadius = center ? (mapRenderWindowRadius(center) ?? fallbackRadius) : fallbackRadius;

  // 좌표를 원값 그대로 캐시 키에 넣으면 지도를 조금만 움직여도 매번 RPC가
  // 실행된다. window 반경의 1/4 격자로 스냅해 인접 이동은 캐시를 재사용한다.
  const grid = baseRadius / 4;
  const lat = center ? snap(center.latitude, grid / 111_000) : null;
  const lng = center ? snap(center.longitude, grid / 88_000) : null;
  // 스냅으로 중심이 최대 격자 반 칸 어긋나므로 RPC 반경에 30%를 더한다.
  const radius = Math.round(baseRadius * 1.3);
  const fetchAll = lat === null || lng === null || radius >= ALL_PLACES_RADIUS_THRESHOLD_M;

  return useQuery({
    queryKey: fetchAll
      ? ['places', 'all', category]
      : ['places', lat, lng, radius, category],
    queryFn: () =>
      fetchAll
        ? fetchAllPlaces(category)
        : fetchNearbyPlaces({
            latitude: lat,
            longitude: lng,
            radiusMeters: radius,
            category,
          }),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * 어떤 장소 주변의 다른 등록 장소 — 장소 상세의 "근처 다른 장소" 섹션용.
 * 자기 자신은 빼고 가까운 순으로 limit 개까지. RPC 가 이미 거리순으로 준다.
 * 기본 반경 20km 는 실측으로 정했다(5km 는 장소의 43%만 이웃이 있어 섹션이
 * 대부분 비었고, 20km 면 78%). 바이크로 20~30분이라 "가는 김에" 범위에도 맞다.
 */
export function useNearbyPlacesOf(place: Place | null, radiusMeters = 20_000, limit = 8) {
  return useQuery({
    queryKey: ['nearby-of', place?.id, radiusMeters, limit],
    queryFn: async () => {
      const list = await fetchNearbyPlaces({
        latitude: place!.latitude,
        longitude: place!.longitude,
        radiusMeters,
      });
      return list.filter((p) => p.id !== place!.id).slice(0, limit);
    },
    enabled: !!place,
  });
}

export interface RecommendedPlaces {
  all: Place[];
  recent: Place[];
  topRated: Place[];
  /** 칩으로 띄울 시도 목록 — 장소가 많은 지역 순 (선택과 무관하게 전체 기준) */
  regions: string[];
}

// 추천 목적지 — 기존 장소 DB를 재사용 (새로 등록된 곳 + 고평점)
export function useRecommendedPlaces(region?: string | null) {
  return useQuery({
    queryKey: ['places', 'recommended'],
    queryFn: () => fetchAllPlaces(null),
    select: (places: Place[]): RecommendedPlaces => {
      const counts: Record<string, number> = {};
      for (const p of places) {
        const r = regionOf(p.address);
        if (r) counts[r] = (counts[r] ?? 0) + 1;
      }
      const scoped = region ? places.filter((p) => regionOf(p.address) === region) : places;

      return {
        all: scoped,
        recent: [...scoped]
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .slice(0, 8),
        topRated: [...scoped]
          .filter((p) => p.reviewCount > 0)
          .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
          .slice(0, 8),
        regions: Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name),
      };
    },
  });
}
