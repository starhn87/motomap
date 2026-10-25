import type { FavoriteList, GeneralFavorite, GeneralFavoritePoint } from './api/favorites';
import type { KakaoLocalResult } from './api/kakaoLocal';
import type { Place } from '../types';
import type { MyPlace, MyPlaceSlot } from '../stores/useMyPlacesStore';
import { approxMeters } from './distance';
import { normalizeSido } from './region';
import { isSameExternalPlace } from './searchMatching';

const compact = (value: string | undefined) => (value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·._-]/g, '');
type NamedPoint = { name?: string; placeName?: string; address?: string; roadAddress?: string; latitude: number; longitude: number };
const pointName = (point: NamedPoint) => compact(point.name ?? point.placeName);
const pointAddress = (point: NamedPoint) => compact(normalizeSido(point.roadAddress || point.address));

// 이름만 같은 체인 지점은 합치지 않는다. 주소와 100m 이내 위치까지 일치해야 한다.
function sameNamedPlace(a: NamedPoint, b: NamedPoint) {
  return !!pointName(a) && pointName(a) === pointName(b) && !!pointAddress(a)
    && pointAddress(a) === pointAddress(b) && approxMeters(a, b) <= 100;
}
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
      (sameSpot(f.latitude, point.latitude) && sameSpot(f.longitude, point.longitude) || sameNamedPlace(f, point)),
  );
}

// 같은 즐겨찾기 판정을 입력 검색·지도 결과·지점 선택에서 공유한다.
export function favoriteMatcher(favorites?: FavoriteList) {
  const ids = new Set(favorites?.places.map(place => place.id) ?? []);
  return (item: { kind: 'place'; place: Place } | { kind: 'kakao'; k: KakaoLocalResult } | { kind: 'riding' }): boolean => {
    if (item.kind === 'place') return ids.has(item.place.id) || (favorites?.general.some(favorite => sameNamedPlace(favorite, item.place)) ?? false);
    if (item.kind === 'riding') return false;
    return !!findGeneralFavorite(favorites?.general ?? [], { ...item.k, name: item.k.placeName, address: item.k.roadAddress || item.k.address });
  };
}

export function favoritesFirst<T>(items: readonly T[], isFavorite: (item: T) => boolean, isRegistered: (item: T) => boolean = () => false): T[] {
  const saved: T[] = [], registered: T[] = [], rest: T[] = [];
  for (const item of items) (isFavorite(item) ? saved : isRegistered(item) ? registered : rest).push(item);
  return [...saved, ...registered, ...rest];
}

export function personalPlaceKind(point: NamedPoint, places: Partial<Record<MyPlaceSlot, MyPlace>>) {
  for (const slot of ['home', 'work'] as const) {
    const saved = places[slot];
    if (saved && (sameNamedPlace(saved, point) || (pointName(saved) && pointName(saved) === pointName(point) && approxMeters(saved, point) < 5) ||
      (pointAddress(saved) && pointAddress(saved) === pointAddress(point) && approxMeters(saved, point) < 20))) return slot;
  }
  return null;
}

// 공급자 상위 후보에 없는 즐겨찾기도 검색어와 일치하면 로컬 목록에서 보완한다.
// 결과 지도에서는 기존 반경 제약을 그대로 적용한다. 개인 자료를 서버에 보내지 않는다.
export function mergeFavoriteCandidates(results: { places: Place[]; kakaoOnly: KakaoLocalResult[] }, favorites: FavoriteList | undefined, query: string,
  bounds?: { center: { latitude: number; longitude: number }; radius: number }) {
  const words = query.trim().split(/\s+/).map(compact).filter(Boolean);
  if (!words.length || !favorites) return results;
  const matches = (point: NamedPoint) => words.every(word => `${pointName(point)}${pointAddress(point)}`.includes(word))
    && (!bounds || approxMeters(bounds.center, point) <= bounds.radius);
  const places = [...results.places];
  for (const place of favorites.places) if (matches(place) && !places.some(old => old.id === place.id)) places.push(place);
  const kakaoOnly = [...results.kakaoOnly];
  for (const favorite of favorites.general) {
    if (!matches(favorite)) continue;
    const index = kakaoOnly.findIndex(row => !!findGeneralFavorite([favorite], { ...row, name: row.placeName, address: row.roadAddress || row.address }));
    if (index >= 0) {
      kakaoOnly[index] = { ...kakaoOnly[index], generalPlaceId: favorite.generalPlaceId ?? kakaoOnly[index].generalPlaceId };
    } else kakaoOnly.push({ placeName: favorite.name, address: favorite.address, roadAddress: favorite.address,
      latitude: favorite.latitude, longitude: favorite.longitude, phone: favorite.phone ?? '', providerId: favorite.providerId,
      generalPlaceId: favorite.generalPlaceId, placeUrl: favorite.placeUrl });
  }
  return { places, kakaoOnly: kakaoOnly.filter(row => {
    const saved = findGeneralFavorite(favorites.general, { ...row, name: row.placeName, address: row.roadAddress || row.address });
    // 저장한 서로 다른 상호를 같은 건물의 등록 장소로 흡수하지 않는다.
    return !places.some(place => saved ? sameNamedPlace(place, saved) : isSameExternalPlace(place, row));
  }) };
}

export function isFavoritePoint(point: NamedPoint & { placeId?: string; generalPlaceId?: string; providerId?: string }, favorites?: FavoriteList) {
  if (point.placeId && favorites?.places.some(place => place.id === point.placeId)) return true;
  return !!findGeneralFavorite(favorites?.general ?? [], { ...point, name: point.name ?? point.placeName, address: point.roadAddress || point.address })
    || (favorites?.places.some(place => sameNamedPlace(place, point)) ?? false);
}
