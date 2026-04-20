import { supabase } from '@/lib/supabase';
import type { Review } from '@/types';

export async function fetchCourseReviews(courseId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('course_reviews')
    .select('*, profiles(nickname, avatar_url)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    placeId: row.course_id,
    userId: row.user_id,
    userName: row.profiles?.nickname ?? row.user_name,
    avatarUrl: row.profiles?.avatar_url ?? null,
    rating: row.rating,
    content: row.content ?? '',
    photos: [],
    createdAt: row.created_at,
  }));
}

export async function createCourseReview(params: {
  courseId: string;
  rating: number;
  content: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('course_reviews').insert({
    course_id: params.courseId,
    user_id: user.id,
    user_name: user.user_metadata?.name ?? user.email ?? '익명 라이더',
    rating: params.rating,
    content: params.content,
  });

  if (error) throw error;
}

export async function updateCourseReview(params: {
  id: string;
  rating: number;
  content: string;
}): Promise<void> {
  const { error } = await supabase
    .from('course_reviews')
    .update({ rating: params.rating, content: params.content })
    .eq('id', params.id);

  if (error) throw error;
}

export async function deleteCourseReview(id: string): Promise<void> {
  const { error } = await supabase.from('course_reviews').delete().eq('id', id);
  if (error) throw error;
}
