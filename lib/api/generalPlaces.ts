import { supabase } from '@/lib/supabase';

export type GeneralPlaceProvider = 'kakao' | 'coordinate';

export interface GeneralPlaceInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  /** 카카오 로컬의 안정적인 장소 ID */
  providerId?: string;
  placeUrl?: string;
}

export interface GeneralPlace extends GeneralPlaceInput {
  id: string;
  provider: GeneralPlaceProvider;
  providerId: string;
  promotedPlaceId?: string;
  rating: number;
  reviewCount: number;
  shareCount: number;
}

export type GeneralPlaceRow = {
  id: string;
  provider: GeneralPlaceProvider;
  provider_place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  place_url: string | null;
  promoted_place_id: string | null;
  rating: number | string;
  review_count: number;
  share_count: number;
};

export const GENERAL_PLACE_SELECT =
  'id, provider, provider_place_id, name, address, latitude, longitude, phone, place_url, promoted_place_id, rating, review_count, share_count';

const sameSpot = (a: number, b: number) => Math.abs(a - b) < 2e-5;

function coordinateKey(place: GeneralPlaceInput): string {
  const name = place.name.normalize('NFKC').trim().toLowerCase().slice(0, 150);
  return `${name}|${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;
}

export function generalPlaceIdentity(place: GeneralPlaceInput): {
  provider: GeneralPlaceProvider;
  providerId: string;
} {
  return place.providerId
    ? { provider: 'kakao', providerId: place.providerId }
    : { provider: 'coordinate', providerId: coordinateKey(place) };
}

export function generalPlaceQueryKey(place: GeneralPlaceInput) {
  const identity = generalPlaceIdentity(place);
  return ['general-place', identity.provider, identity.providerId] as const;
}

export function generalPlaceUploadKey(place: GeneralPlaceInput): string {
  const { provider, providerId } = generalPlaceIdentity(place);
  return `${provider}-${providerId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

export function rowToGeneralPlace(row: GeneralPlaceRow): GeneralPlace {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_place_id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone ?? undefined,
    placeUrl: row.place_url ?? undefined,
    promotedPlaceId: row.promoted_place_id ?? undefined,
    rating: Number(row.rating) || 0,
    reviewCount: row.review_count ?? 0,
    shareCount: row.share_count ?? 0,
  };
}

/**
 * 이미 알려진 일반 장소를 찾는다. 카카오 ID가 아직 전파되지 않았던 즐겨찾기와
 * 지도 심벌도 같은 곳으로 합쳐지도록, 정확한 ID가 없으면 좌표를 한 번 대조한다.
 */
export async function findGeneralPlace(place: GeneralPlaceInput): Promise<GeneralPlace | null> {
  const { provider, providerId } = generalPlaceIdentity(place);
  const { data: exact, error: exactError } = await supabase
    .from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .eq('provider', provider)
    .eq('provider_place_id', providerId)
    .maybeSingle();
  if (exactError) throw exactError;
  if (exact) return rowToGeneralPlace(exact as GeneralPlaceRow);

  const delta = 2e-5;
  const { data: nearby, error: nearbyError } = await supabase
    .from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .gte('latitude', place.latitude - delta)
    .lte('latitude', place.latitude + delta)
    .gte('longitude', place.longitude - delta)
    .lte('longitude', place.longitude + delta)
    .limit(5);
  if (nearbyError) throw nearbyError;

  const normalizedName = place.name.normalize('NFKC').trim().toLowerCase();
  const match = (nearby ?? []).find(
    (row: any) =>
      sameSpot(row.latitude, place.latitude) &&
      sameSpot(row.longitude, place.longitude) &&
      String(row.name).normalize('NFKC').trim().toLowerCase() === normalizedName,
  );
  return match ? rowToGeneralPlace(match as GeneralPlaceRow) : null;
}

/** 즐겨찾기·리뷰·길안내처럼 기록이 생기는 순간에만 일반 장소 행을 만든다. */
export async function ensureGeneralPlace(place: GeneralPlaceInput): Promise<GeneralPlace> {
  const existing = await findGeneralPlace(place);
  if (existing) return existing;

  const { provider, providerId } = generalPlaceIdentity(place);
  const { data, error } = await supabase
    .from('general_places')
    .insert({
      provider,
      provider_place_id: providerId,
      name: place.name.trim(),
      address: place.address.trim() || place.name.trim(),
      latitude: place.latitude,
      longitude: place.longitude,
      phone: place.phone?.trim() || null,
      place_url: place.placeUrl?.trim() || null,
    })
    .select(GENERAL_PLACE_SELECT)
    .single();

  if (!error && data) return rowToGeneralPlace(data as GeneralPlaceRow);
  // 동시에 즐겨찾기·리뷰가 실행되면 유니크 충돌이 날 수 있다. 승자는 이미 같은
  // 행을 만들었으므로 다시 읽는다.
  if (error?.code === '23505') {
    const winner = await findGeneralPlace(place);
    if (winner) return winner;
  }
  throw error;
}

export interface GeneralPlaceBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** 사용자가 라이더 공유 레이어를 켰을 때만 부르는 공개 집계 목록. */
export async function fetchSharedGeneralPlaces(
  bounds?: GeneralPlaceBounds | null,
): Promise<GeneralPlace[]> {
  let query = supabase
    .from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .gt('share_count', 0)
    .is('promoted_place_id', null)
    .order('share_count', { ascending: false })
    .order('last_shared_at', { ascending: false })
    .limit(250);

  if (bounds) {
    query = query
      .gte('latitude', bounds.south)
      .lte('latitude', bounds.north)
      .gte('longitude', bounds.west)
      .lte('longitude', bounds.east);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as GeneralPlaceRow[]).map(rowToGeneralPlace);
}
