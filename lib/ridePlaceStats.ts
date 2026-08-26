import type { PlaceRide } from '@/lib/api/rides';
import { findNearbySavedPlaceSlot } from '@/lib/myPlaces';
import type { MyPlace, MyPlaceSlot } from '@/stores/useMyPlacesStore';

interface ArrivalGoal {
  latitude: number;
  longitude: number;
  name: string;
  placeId?: string;
  generalPlaceId?: string;
  courseId?: string;
}

interface ArrivalVia {
  latitude: number;
  longitude: number;
  placeId: string;
}

export interface UnexcludedPlaceRideTarget {
  ride_id: string;
  latitude: number;
  longitude: number;
}

type SavedPlaces = Partial<Record<MyPlaceSlot, MyPlace>>;

function isPersonalDestination(places: SavedPlaces, target: ArrivalGoal | ArrivalVia): boolean {
  return findNearbySavedPlaceSlot(places, target) !== null;
}

/** 도착 시점부터 집·회사 기록을 표시·추천 통계에서 제외해 새 오염을 막는다. */
export function buildPlaceRidesForArrival(
  goal: ArrivalGoal,
  vias: ArrivalVia[],
  places: SavedPlaces,
): PlaceRide[] {
  return [
    ...(goal.placeId
      ? [{
          place_id: goal.placeId,
          role: 'goal' as const,
          excluded_from_place_stats: isPersonalDestination(places, goal),
        }]
      : []),
    ...vias.map((via) => ({
      place_id: via.placeId,
      role: 'via' as const,
      excluded_from_place_stats: isPersonalDestination(places, via),
    })),
    ...(!goal.placeId && !goal.courseId && goal.name.trim()
      ? [{
          role: 'goal' as const,
          name: goal.name.trim(),
          latitude: goal.latitude,
          longitude: goal.longitude,
          excluded_from_place_stats: isPersonalDestination(places, goal),
          ...(goal.generalPlaceId ? { general_place_id: goal.generalPlaceId } : {}),
        }]
      : []),
  ];
}

/** 과거 기록 좌표와 로컬 집·회사를 기기 안에서 비교해 서버에는 기록 id만 보낸다. */
export function findPersonalPlaceRideIds(
  targets: UnexcludedPlaceRideTarget[],
  places: SavedPlaces,
): string[] {
  return targets.flatMap((target) =>
    findNearbySavedPlaceSlot(places, target) ? [target.ride_id] : [],
  );
}
