import { supabase } from '@/lib/supabase';
import type { Place, PlaceCategory } from '@/types';
import { requireUser } from '@/lib/auth';

// nearby_places / all_places RPC 가 반환하는 행 (PostGIS location 을 lat/lng 로 풀어서 준다)
export interface PlaceRow {
  id: string;
  name: string;
  description: string | null;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address: string;
  phone: string | null;
  photos: string[] | null;
  rating: number | string | null;
  review_count: number | null;
  tags: string[] | null;
  opening_hours: string | null;
  parking_info: string | null;
  submitted_by: string;
  approved: boolean;
  created_at: string;
}

interface NearbyParams {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  category?: PlaceCategory | null;
}

interface SubmitPlaceParams {
  name: string;
  description: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address: string;
  phone?: string;
  tags?: string[];
  openingHours?: string;
  parkingInfo?: string;
}

export function rowToPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    phone: row.phone ?? undefined,
    photos: row.photos ?? [],
    rating: Number(row.rating) || 0,
    reviewCount: row.review_count ?? 0,
    tags: row.tags ?? [],
    openingHours: row.opening_hours ?? undefined,
    parkingInfo: row.parking_info ?? undefined,
    submittedBy: row.submitted_by,
    approved: row.approved,
    createdAt: row.created_at,
  };
}

export async function fetchNearbyPlaces({
  latitude,
  longitude,
  radiusMeters = 5000,
  category,
}: NearbyParams): Promise<Place[]> {
  const { data, error } = await supabase.rpc('nearby_places', {
    lat: latitude,
    lng: longitude,
    radius_meters: radiusMeters,
    category_filter: category ?? null,
  });

  if (error) throw error;

  return (data ?? []).map(rowToPlace);
}

/** 코스 경로선 반경 내 장소 — 코스 진행 순서(route_fraction 오름차순)로 온다 */
export async function fetchPlacesNearCourse(
  courseId: string
): Promise<{ place: Place; routeFraction: number }[]> {
  const { data, error } = await supabase.rpc('places_near_course', {
    course_id: courseId,
  });

  if (error) throw error;

  return ((data ?? []) as (PlaceRow & { route_fraction: number })[]).map((row) => ({
    place: rowToPlace(row),
    routeFraction: row.route_fraction,
  }));
}

export async function fetchAllPlaces(
  category?: PlaceCategory | null
): Promise<Place[]> {
  const { data, error } = await supabase.rpc('all_places', {
    category_filter: category ?? null,
  });

  if (error) throw error;

  return (data ?? []).map(rowToPlace);
}

/**
 * 같은 주소의 살아있는 제보/장소가 있는지 확인 (RLS 우회 RPC — 존재 여부만 반환).
 * 'approved' 이미 등록됨 | 'pending' 검토 중 | null 없음.
 * 체크 실패(네트워크 등) 시엔 제출을 막지 않도록 null 을 반환한다(fail-open).
 */
export async function checkPlaceDuplicate(
  address: string,
): Promise<'approved' | 'pending' | null> {
  const { data, error } = await supabase.rpc('place_exists_at_address', {
    p_address: address,
  });
  if (error) return null;
  return (data as 'approved' | 'pending' | null) ?? null;
}

export async function submitPlace(params: SubmitPlaceParams): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from('places').insert({
    name: params.name,
    description: params.description,
    category: params.category,
    location: `POINT(${params.longitude} ${params.latitude})`,
    address: params.address,
    phone: params.phone,
    tags: params.tags ?? [],
    opening_hours: params.openingHours,
    parking_info: params.parkingInfo,
    submitted_by: user.id,
  });

  if (error) throw error;
}
