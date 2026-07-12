import { supabase } from '@/lib/supabase';
import type { Place, Review } from '@/types';
import { rowToPlace } from '@/lib/api/places';
import { getCurrentUser } from '@/lib/auth';

export async function fetchMySubmissions(): Promise<Place[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    // places 테이블 직접 조회는 PostGIS location 을 주므로 좌표를 풀어서 rowToPlace 에 넘긴다
    let latitude = 0;
    let longitude = 0;
    if (row.location && typeof row.location === 'object') {
      longitude = row.location.coordinates?.[0] ?? 0;
      latitude = row.location.coordinates?.[1] ?? 0;
    }
    return rowToPlace({ ...row, latitude, longitude });
  });
}

export async function fetchMyReviews(): Promise<(Review & { placeName: string })[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('reviews')
    .select('*, places(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    userName: row.user_name,
    avatarUrl: null,
    rating: row.rating,
    content: row.content ?? '',
    photos: row.photos ?? [],
    createdAt: row.created_at,
    placeName: row.places?.name ?? '알 수 없는 장소',
  }));
}
