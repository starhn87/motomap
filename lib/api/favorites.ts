import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import { requireUser, getCurrentUser } from '@/lib/auth';
import { ensureGeneralPlace, type GeneralPlaceInput } from '@/lib/api/generalPlaces';

// 즐겨찾기는 두 갈래다 — 등록 장소(place_id)와 일반 장소(이름+좌표).
// 라이더 특화 장소가 아니어도 자주 가는 곳이 있어서, 집·회사 두 칸으로는
// 부족했다. 스키마 사연은 supabase/migrations/032 참고.

/** 등록되지 않은 일반 장소 즐겨찾기 */
export interface GeneralFavorite {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  generalPlaceId?: string;
  providerId?: string;
  placeUrl?: string;
}

export interface Favorites {
  /** 등록 장소 id 목록 — 별 토글 상태 판정에 쓴다 */
  placeIds: string[];
  general: GeneralFavorite[];
}

// 좌표는 부동소수라 그대로 비교하면 같은 곳도 안 걸린다. DB 유니크 인덱스와
// 같은 기준(5자리 ≈ 1m)으로 맞춘다.
const sameSpot = (a: number, b: number) => Math.abs(a - b) < 1e-5;

export function findGeneralFavorite(
  list: GeneralFavorite[],
  point: { latitude: number; longitude: number },
): GeneralFavorite | undefined {
  return list.find(
    (f) => sameSpot(f.latitude, point.latitude) && sameSpot(f.longitude, point.longitude),
  );
}

export async function fetchFavorites(): Promise<Favorites> {
  const user = await getCurrentUser();
  if (!user) return { placeIds: [], general: [] };

  const { data, error } = await supabase
    .from('favorites')
    .select('id, place_id, general_place_id, name, address, latitude, longitude, phone, general_places(provider, provider_place_id, place_url)')
    .eq('user_id', user.id);

  if (error) throw error;

  const rows = data ?? [];
  return {
    placeIds: rows.filter((r) => r.place_id).map((r) => r.place_id as string),
    general: rows
      .filter((r) => !r.place_id)
      .map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        address: (r.address as string) ?? '',
        latitude: r.latitude as number,
        longitude: r.longitude as number,
        phone: (r.phone as string) ?? undefined,
        generalPlaceId: (r.general_place_id as string) ?? undefined,
        providerId:
          r.general_places?.provider === 'kakao'
            ? (r.general_places.provider_place_id as string)
            : undefined,
        placeUrl: (r.general_places?.place_url as string) ?? undefined,
      })),
  };
}

export interface FavoriteList {
  places: Place[];
  general: GeneralFavorite[];
}

export async function fetchFavoritePlaces(): Promise<FavoriteList> {
  const { placeIds, general } = await fetchFavorites();
  if (placeIds.length === 0) return { places: [], general };

  const { data, error } = await supabase.rpc('all_places', {
    category_filter: null,
  });

  if (error) throw error;

  return {
    places: (data ?? [])
      .filter((row: PlaceRow) => placeIds.includes(row.id))
      .map(rowToPlace),
    general,
  };
}

/** 원하는 최종 상태를 그대로 반영한다. 재시도돼도 상태가 다시 뒤집히지 않는다. */
export async function setFavorite(placeId: string, on: boolean): Promise<void> {
  const user = await requireUser();
  if (on) {
    const { error } = await supabase.from('favorites').insert({
      user_id: user.id,
      place_id: placeId,
    });
    // 이미 원하는 상태면 성공으로 취급한다.
    if (error && error.code !== '23505') throw error;
    return;
  }

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('place_id', placeId);
  if (error) throw error;
}

export interface GeneralFavoriteChange {
  place: GeneralPlaceInput;
  on: boolean;
  /** 해제 시 캐시에 이미 있는 서버 행 ID. 초기 캐시가 없을 때만 서버 조회로 폴백한다. */
  favoriteId?: string;
}

/** 일반 장소 즐겨찾기도 원하는 최종 상태를 멱등적으로 반영한다. */
export async function setGeneralFavorite({
  place,
  on,
  favoriteId,
}: GeneralFavoriteChange): Promise<void> {
  const user = await requireUser();
  if (!on) {
    // 낙관적 행은 서버 ID가 아니므로 실제 캐시를 다시 읽어 대상 행을 찾는다.
    let id = favoriteId?.startsWith('optimistic-') ? undefined : favoriteId;
    if (!id) {
      const { general } = await fetchFavorites();
      id = findGeneralFavorite(general, place)?.id;
    }
    if (!id) return;
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }

  const generalPlace = await ensureGeneralPlace(place);
  const { error } = await supabase.from('favorites').insert({
    user_id: user.id,
    place_id: null,
    general_place_id: generalPlace.id,
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone ?? null,
  });
  if (error && error.code !== '23505') throw error;
}
