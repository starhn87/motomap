import { supabase } from '@/lib/supabase';
import type { Place, RidingCourse } from '@/types';

export interface SearchResults {
  places: Place[];
  courses: RidingCourse[];
}

export async function searchAll(query: string): Promise<SearchResults> {
  const term = `%${query}%`;

  const [placesRes, coursesRes] = await Promise.all([
    supabase.rpc('all_places', { category_filter: null }),
    supabase.from('courses').select('*').order('created_at', { ascending: false }),
  ]);

  const places = (placesRes.data ?? [])
    .filter((row: any) =>
      row.name.toLowerCase().includes(query.toLowerCase()) ||
      row.address?.toLowerCase().includes(query.toLowerCase()) ||
      (row.tags ?? []).some((t: string) => t.toLowerCase().includes(query.toLowerCase()))
    )
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
