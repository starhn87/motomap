import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import { requireUser, getCurrentUser } from '@/lib/auth';

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
    .select('id, place_id, name, address, latitude, longitude, phone')
    .eq('user_id', user.id);

  if (error) throw error;

  const rows = data ?? [];
  return {
    placeIds: rows.filter((r) => r.place_id).map((r) => r.place_id as string),
    general: rows
      .filter((r) => !r.place_id)
      .map((r) => ({
        id: r.id as string,
        name: r.name as string,
        address: (r.address as string) ?? '',
        latitude: r.latitude as number,
        longitude: r.longitude as number,
        phone: (r.phone as string) ?? undefined,
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

export async function toggleFavorite(placeId: string): Promise<boolean> {
  const user = await requireUser();

  const { data: existing, error: selectError } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase.from('favorites').insert({
      user_id: user.id,
      place_id: placeId,
    });
    if (error) throw error;
    return true;
  }
}

/**
 * 일반 장소 즐겨찾기 토글. 켜면 true.
 *
 * 좌표에는 유니크 인덱스가 걸려 있어 같은 곳을 두 번 담을 수 없다. 다만 반올림
 * 기준이라 클라이언트에서 먼저 찾아 지우는 쪽이 정확하다.
 */
export async function toggleGeneralFavorite(place: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
}): Promise<boolean> {
  const user = await requireUser();

  const { general } = await fetchFavorites();
  const existing = findGeneralFavorite(general, place);

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from('favorites').insert({
    user_id: user.id,
    place_id: null,
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone ?? null,
  });
  if (error) throw error;
  return true;
}
