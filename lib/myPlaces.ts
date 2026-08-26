import type { MyPlace, MyPlaceSlot } from '@/stores/useMyPlacesStore';

interface Coordinate {
  latitude: number;
  longitude: number;
}

const SAME_PLACE_EPSILON = 1e-5;

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
