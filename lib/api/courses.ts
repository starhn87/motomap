import { supabase } from '@/lib/supabase';
import type { RidingCourse } from '@/types';

function rowToCourse(row: any): RidingCourse {
  return {
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
  };
}

export async function fetchCourses(): Promise<RidingCourse[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
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

export async function submitCourse(params: {
  name: string;
  description: string;
  distance: number;
  duration: number;
  coordinates: [number, number][];
  tags?: string[];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

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
