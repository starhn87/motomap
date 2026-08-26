import type { MyPlace, MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { approxMeters } from '@/lib/distance';

interface Coordinate {
  latitude: number;
  longitude: number;
}

const SAME_PLACE_EPSILON = 1e-5;
export const PERSONAL_DESTINATION_RADIUS_METERS = 40;

function isNear(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_PLACE_EPSILON;
}

export function findSavedPlaceSlot(
  places: Partial<Record<MyPlaceSlot, MyPlace>>,
  target?: Coordinate | null,
): MyPlaceSlot | null {
  if (!target) return null;

  for (const slot of ['home', 'work'] as const) {
    const place = places[slot];
    if (
      place &&
      isNear(place.latitude, target.latitude) &&
      isNear(place.longitude, target.longitude)
    ) {
      return slot;
    }
  }

  return null;
}

/**
 * 공급자마다 같은 장소의 대표 좌표가 조금씩 달라질 수 있어, 주행 통계 제외
 * 판정만 40m 반경을 쓴다. 집·회사 버튼의 선택 상태는 기존의 엄격한 좌표 비교를
 * 유지해 인접 장소를 같은 저장 장소로 오인하지 않는다.
 */
export function findNearbySavedPlaceSlot(
  places: Partial<Record<MyPlaceSlot, MyPlace>>,
  target?: Coordinate | null,
): MyPlaceSlot | null {
  if (!target) return null;

  for (const slot of ['home', 'work'] as const) {
    const place = places[slot];
    if (place && approxMeters(place, target) <= PERSONAL_DESTINATION_RADIUS_METERS) {
      return slot;
    }
  }

  return null;
}
