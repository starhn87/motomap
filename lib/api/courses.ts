import { supabase } from '@/lib/supabase';
import type { RidingCourse } from '@/types';
import { requireUser } from '@/lib/auth';

function rowToCourse(row: any): RidingCourse {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    distance: Number(row.distance),
    duration: row.duration,
    coordinates: row.coordinates ?? [],
    sectionFrom: row.section_from ?? null,
    sectionTo: row.section_to ?? null,
    routeName: row.route_name ?? null,
    waypoints: [],
    tags: row.tags ?? [],
    createdBy: row.created_by,
    rating: Number(row.rating) || 0,
    reviewCount: row.review_count ?? 0,
    createdAt: row.created_at,
  };
}

export async function fetchCourses(): Promise<RidingCourse[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('approved', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(rowToCourse);
}

export async function fetchCourseById(id: string): Promise<RidingCourse> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  return rowToCourse(data);
}

/** 같은 이름의 살아있는 코스가 있는지 확인 — 'approved' | 'pending' | null (없음) */
export async function checkCourseNameDuplicate(
  name: string,
): Promise<'approved' | 'pending' | null> {
  const { data, error } = await supabase.rpc('course_exists_with_name', {
    p_name: name,
  });
  if (error) return null; // 체크 실패 시 제출을 막지 않는다(fail-open)
  return (data as 'approved' | 'pending' | null) ?? null;
}

export async function submitCourse(params: {
  name: string;
  description: string;
  distance: number;
  duration: number;
  coordinates: [number, number][];
  tags?: string[];
}): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from('courses').insert({
    name: params.name,
    description: params.description,
    distance: params.distance,
    duration: params.duration,
    coordinates: params.coordinates,
    tags: params.tags ?? [],
    created_by: user.id,
  });

  if (error) throw error;
}
