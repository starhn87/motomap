import { supabase } from '@/lib/supabase';
import type { Place, Review } from '@/types';

export async function fetchMySubmissions(): Promise<Place[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    let lat = 0;
    let lng = 0;
    if (row.location && typeof row.location === 'object') {
      lng = row.location.coordinates?.[0] ?? 0;
      lat = row.location.coordinates?.[1] ?? 0;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      category: row.category,
      latitude: lat,
      longitude: lng,
      address: row.address,
      phone: row.phone,
      photos: row.photos ?? [],
      rating: Number(row.rating) || 0,
      reviewCount: row.review_count ?? 0,
      tags: row.tags ?? [],
      openingHours: row.opening_hours,
      parkingInfo: row.parking_info,
      submittedBy: row.submitted_by,
      approved: row.approved,
      createdAt: row.created_at,
    };
  });
}

export async function fetchMyReviews(): Promise<(Review & { placeName: string })[]> {
  const { data: { user } } = await supabase.auth.getUser();
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
