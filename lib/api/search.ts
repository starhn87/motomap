import { supabase } from '@/lib/supabase';
import type { Place, RidingCourse } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';

export interface SearchResults {
  places: Place[];
  courses: RidingCourse[];
}

// 등록 장소와 카카오 일반 장소가 같은 곳인지 — 이름(정규화) 일치 + 좌표 근접.
// 제보 폼이 카카오 좌표를 그대로 쓰므로 20m 이내는 이름이 조금 달라도 동일 장소다.
const normName = (n: string) => n.replace(/\s/g, '').toLowerCase();
export function isSamePlace(
  p: { name: string; latitude: number; longitude: number },
  k: { name: string; latitude: number; longitude: number },
): boolean {
  const dist = Math.hypot((p.latitude - k.latitude) * 111000, (p.longitude - k.longitude) * 88000);
  if (dist > 150) return false;
  if (dist < 20) return true;
  const pn = normName(p.name);
  const kn = normName(k.name);
  return kn === pn || kn.includes(pn) || pn.includes(kn);
}

export async function searchAll(query: string): Promise<SearchResults> {
  const [placesRes, coursesRes] = await Promise.all([
    supabase.rpc('all_places', { category_filter: null }),
    supabase
      .from('courses')
      .select('*')
      .eq('approved', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
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
      sectionFrom: row.section_from ?? null,
      sectionTo: row.section_to ?? null,
      routeName: row.route_name ?? null,
    routeGeometry: row.route_geometry ?? null,
      waypoints: [],
      tags: row.tags ?? [],
      createdBy: row.created_by,
      rating: Number(row.rating) || 0,
      reviewCount: row.review_count ?? 0,
      createdAt: row.created_at,
    }));

  return { places, courses };
}
