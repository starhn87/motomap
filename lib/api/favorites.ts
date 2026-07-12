import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import { requireUser, getCurrentUser } from '@/lib/auth';

export async function fetchFavorites(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('favorites')
    .select('place_id')
    .eq('user_id', user.id);

  if (error) throw error;

  return (data ?? []).map((row) => row.place_id);
}

export async function fetchFavoritePlaces(): Promise<Place[]> {
  const user = await getCurrentUser();
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
    .filter((row: PlaceRow) => placeIds.includes(row.id))
    .map(rowToPlace);
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
