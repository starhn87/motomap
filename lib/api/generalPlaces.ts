import { supabase } from '@/lib/supabase';
import { approxMeters } from '@/lib/distance';
import { normalizeSido } from '@/lib/region';

export type GeneralPlaceProvider = 'kakao' | 'coordinate';

export interface GeneralPlaceInput {
  generalPlaceId?: string;
  provider?: GeneralPlaceProvider;
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
  if (place.provider === 'coordinate' && place.providerId) {
    return { provider: 'coordinate', providerId: place.providerId };
  }
  return place.providerId && place.provider !== 'coordinate'
    ? { provider: 'kakao', providerId: place.providerId }
    : { provider: 'coordinate', providerId: coordinateKey(place) };
}

export function generalPlaceQueryKey(place: GeneralPlaceInput) {
  if (place.generalPlaceId) return ['general-place', 'id', place.generalPlaceId] as const;
  const identity = generalPlaceIdentity(place);
  return ['general-place', identity.provider, identity.providerId] as const;
}

export function generalPlaceUploadKey(place: GeneralPlaceInput): string {
  if (place.generalPlaceId) return `general-${place.generalPlaceId}`;
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
export async function findGeneralPlace(place: GeneralPlaceInput, signal?: AbortSignal): Promise<GeneralPlace | null> {
  if (place.generalPlaceId) {
    const request = supabase.from('general_places').select(GENERAL_PLACE_SELECT)
      .eq('id', place.generalPlaceId);
    const { data, error } = await (signal ? request.abortSignal(signal) : request).maybeSingle();
    if (error) throw error;
    // 알려진 ID가 사라졌다면 다른 행을 신설해 기존 기록을 분단하지 않는다.
    if (!data) throw new Error('general_place_unavailable');
    return rowToGeneralPlace(data as GeneralPlaceRow);
  }
  const { provider, providerId } = generalPlaceIdentity(place);
  const exactRequest = supabase
    .from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .eq('provider', provider)
    .eq('provider_place_id', providerId);
  const { data: exact, error: exactError } = await (signal ? exactRequest.abortSignal(signal) : exactRequest).maybeSingle();
  if (exactError) throw exactError;
  if (exact) return rowToGeneralPlace(exact as GeneralPlaceRow);

  const delta = 2e-5;
  const nearbyRequest = supabase
    .from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .gte('latitude', place.latitude - delta)
    .lte('latitude', place.latitude + delta)
    .gte('longitude', place.longitude - delta)
    .lte('longitude', place.longitude + delta)
    .limit(5);
  const { data: nearby, error: nearbyError } = await (signal ? nearbyRequest.abortSignal(signal) : nearbyRequest);
  if (nearbyError) throw nearbyError;

  const normalizedName = place.name.normalize('NFKC').trim().toLowerCase();
  const match = (nearby ?? []).find(
    (row: any) =>
      sameSpot(row.latitude, place.latitude) &&
      sameSpot(row.longitude, place.longitude) &&
      String(row.name).normalize('NFKC').trim().toLowerCase() === normalizedName,
  );
  if (match) return rowToGeneralPlace(match as GeneralPlaceRow);
  if (!place.placeUrl?.startsWith('https://map.naver.com/') || !place.address.trim()) return null;
  // 공급자 좌표 차이는 이름·주소까지 정확히 같은 유일한 기존 행만 읽어 재사용한다.
  // 건물 안 다른 업체, 같은 이름의 지점, 주소 없는 후보는 넓게 합치지 않는다.
  const candidateRequest = supabase.from('general_places')
    .select(GENERAL_PLACE_SELECT)
    .gte('latitude', place.latitude - 0.0015).lte('latitude', place.latitude + 0.0015)
    .gte('longitude', place.longitude - 0.002).lte('longitude', place.longitude + 0.002)
    .limit(100);
  const { data: candidates, error: candidatesError } = await (signal ? candidateRequest.abortSignal(signal) : candidateRequest);
  if (candidatesError) throw candidatesError;
  if ((candidates?.length ?? 0) >= 100) return null;
  const compact = (value: string) => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const matches = (candidates ?? []).filter((row: any) =>
    compact(String(row.name)) === compact(place.name) &&
    compact(normalizeSido(String(row.address))) === compact(normalizeSido(place.address)) &&
    approxMeters(place, row) <= 150);
  return matches.length === 1 ? rowToGeneralPlace(matches[0] as GeneralPlaceRow) : null;
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
