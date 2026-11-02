import type { GeneralPlace } from '@/lib/api/generalPlaces';
import type { Place } from '@/types';

export interface RankedPlace<T> { place: T; rank: number }

// 같은 측정값은 공동 순위다. 배치용 동률 정렬을 인기 차이로 표현하지 않는다.
function withRanks<T>(places: T[], score: (place: T) => number): RankedPlace<T>[] {
  let rank = 0;
  let previous: number | undefined;
  return places.map((place, index) => {
    const value = score(place);
    if (value !== previous) rank = index + 1;
    previous = value;
    return { place, rank };
  });
}

export function rankRecommendedPlaces(places: readonly GeneralPlace[]): RankedPlace<GeneralPlace>[] {
  const candidates = places.filter(place => !place.promotedPlaceId && Number.isSafeInteger(place.shareCount) && place.shareCount > 0);
  return withRanks([...candidates].sort((a, b) => b.shareCount - a.shareCount || a.id.localeCompare(b.id)), place => place.shareCount);
}

// 표시 평점과 동률 판정이 달라 같은 숫자에 다른 순위가 붙지 않게 한다.
export function displayedRating(rating: number): number { return Math.round(rating * 10) / 10; }

export function rankReviewedPlaces(places: readonly Place[]): RankedPlace<Place>[] {
  const candidates = places.filter(place => place.approved && Number.isSafeInteger(place.reviewCount)
    && place.reviewCount > 0 && Number.isFinite(place.rating) && place.rating >= 1 && place.rating <= 5);
  const sorted = [...candidates].sort((a, b) => displayedRating(b.rating) - displayedRating(a.rating)
    || b.reviewCount - a.reviewCount || a.id.localeCompare(b.id));
  return withRanks(sorted, place => displayedRating(place.rating));
}
