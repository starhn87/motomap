import type { FavoriteList, GeneralFavorite, GeneralFavoritePoint } from './api/favorites';
import type { KakaoLocalResult } from './api/kakaoLocal';
import type { Place } from '../types';

const sameSpot = (a: number, b: number) => Math.abs(a - b) < 1e-5;

export function findGeneralFavorite(
  list: GeneralFavorite[],
  point: GeneralFavoritePoint,
): GeneralFavorite | undefined {
  if (point.generalPlaceId) {
    const exact = list.find((favorite) => favorite.generalPlaceId === point.generalPlaceId);
    if (exact) return exact;
  }
  const compatibleIds = (favorite: GeneralFavorite) => !(point.generalPlaceId && favorite.generalPlaceId &&
    point.generalPlaceId !== favorite.generalPlaceId);
  if (point.providerId) {
    const exact = list.find((favorite) => compatibleIds(favorite) && favorite.providerId === point.providerId);
    if (exact) return exact;
  }
  return list.find(
    (f) => compatibleIds(f) && !(point.providerId && f.providerId && point.providerId !== f.providerId) &&
      sameSpot(f.latitude, point.latitude) && sameSpot(f.longitude, point.longitude),
  );
}

// 같은 즐겨찾기 판정을 입력 검색·지도 결과·지점 선택에서 공유한다.
export function favoriteMatcher(favorites?: FavoriteList) {
  const ids = new Set(favorites?.places.map(place => place.id) ?? []);
  return (item: { kind: 'place'; place: Place } | { kind: 'kakao'; k: KakaoLocalResult } | { kind: 'riding' }): boolean => {
    if (item.kind === 'place') return ids.has(item.place.id);
    if (item.kind === 'riding') return false;
    return !!findGeneralFavorite(favorites?.general ?? [], item.k);
  };
}

export function favoritesFirst<T>(items: readonly T[], isFavorite: (item: T) => boolean): T[] {
  return [...items.filter(isFavorite), ...items.filter(item => !isFavorite(item))];
}
