import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';
import { rowToPlace } from '@/lib/api/places';
import { queryKeys } from '@/lib/queryKeys';

export async function fetchPlaceById(id: string): Promise<Place | null> {
  const { data, error } = await supabase.rpc('all_places', {
    category_filter: undefined,
  });

  if (error) return null;

  const row = (data ?? []).find((candidate) => candidate.id === id);
  if (!row) return null;

  return rowToPlace(row);
}

export function usePlace(id: string | null) {
  return useQuery({
    queryKey: queryKeys.places.detail(id),
    queryFn: () => fetchPlaceById(id!),
    enabled: !!id,
  });
}
