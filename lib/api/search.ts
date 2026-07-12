import { supabase } from '@/lib/supabase';
import type { Place, RidingCourse } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';

export interface SearchResults {
  places: Place[];
  courses: RidingCourse[];
}

export async function searchAll(query: string): Promise<SearchResults> {
  const [placesRes, coursesRes] = await Promise.all([
    supabase.rpc('all_places', { category_filter: null }),
    supabase.from('courses').select('*').order('created_at', { ascending: false }),
  ]);

  const places = (placesRes.data ?? [])
    .filter((row: PlaceRow) =>
      row.name.toLowerCase().includes(query.toLowerCase()) ||
      row.address?.toLowerCase().includes(query.toLowerCase()) ||
      (row.tags ?? []).some((t) => t.toLowerCase().includes(query.toLowerCase()))
    )
    .map(rowToPlace);

  const courses = (coursesRes.data ?? [])
    .filter((row: any) =>
      row.name.toLowerCase().includes(query.toLowerCase()) ||
      row.description?.toLowerCase().includes(query.toLowerCase()) ||
      (row.tags ?? []).some((t: string) => t.toLowerCase().includes(query.toLowerCase()))
    )
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      distance: Number(row.distance),
      duration: row.duration,
      coordinates: row.coordinates ?? [],
      waypoints: [],
      createdBy: row.created_by,
      rating: Number(row.rating) || 0,
      reviewCount: row.review_count ?? 0,
      createdAt: row.created_at,
    }));

  return { places, courses };
}
