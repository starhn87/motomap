import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';

export async function fetchFavorites(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('favorites')
    .select('place_id')
    .eq('user_id', user.id);

  if (error) throw error;

  return (data ?? []).map((row) => row.place_id);
}

export async function fetchFavoritePlaces(): Promise<Place[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: favData, error: favError } = await supabase
    .from('favorites')
    .select('place_id')
    .eq('user_id', user.id);

  if (favError) throw favError;

  const placeIds = (favData ?? []).map((row) => row.place_id);
  if (placeIds.length === 0) return [];

  const { data, error } = await supabase.rpc('all_places', {
    category_filter: null,
  });

  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => placeIds.includes(row.id))
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
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
    }));
}

export async function toggleFavorite(placeId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

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
