import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';

export async function fetchPlaceById(id: string): Promise<Place | null> {
  const { data, error } = await supabase.rpc('all_places', {
    category_filter: null,
  });

  if (error) return null;

  const row = (data ?? []).find((r: PlaceRow) => r.id === id);
  if (!row) return null;

  return rowToPlace(row);
}

export function usePlace(id: string | null) {
  return useQuery({
    queryKey: ['place', id],
    queryFn: () => fetchPlaceById(id!),
    enabled: !!id,
  });
}
