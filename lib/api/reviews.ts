import { supabase } from '@/lib/supabase';
import type { Review } from '@/types';
import { requireUser } from '@/lib/auth';

export const REVIEWS_PAGE_SIZE = 20;

export async function fetchReviews(placeId: string, page = 0): Promise<Review[]> {
  const from = page * REVIEWS_PAGE_SIZE;
  const { data, error } = await supabase
    .from('reviews')
    .select('*, profiles(nickname, avatar_url), review_likes(user_id)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false })
    .range(from, from + REVIEWS_PAGE_SIZE - 1);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    userName: row.profiles?.nickname ?? row.user_name,
    avatarUrl: row.profiles?.avatar_url ?? null,
    bikeModel: row.bike_model ?? null,
    rating: row.rating,
    content: row.content ?? '',
    photos: row.photos ?? [],
    createdAt: row.created_at,
    likeCount: row.like_count ?? 0,
    // RLS 가 본인 행만 돌려주므로 배열이 비어 있지 않으면 내가 누른 것
    likedByMe: (row.review_likes ?? []).length > 0,
  }));
}

/** 좋아요 토글 — 누르면 추가, 이미 눌렀으면 해제 */
export async function toggleReviewLike(reviewId: string, liked: boolean): Promise<void> {
  const user = await requireUser();
  if (liked) {
    const { error } = await supabase
      .from('review_likes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('review_likes')
      .insert({ review_id: reviewId, user_id: user.id });
    if (error) throw error;
  }
}

export async function createReview(params: {
  placeId: string;
  rating: number;
  content: string;
  photos?: string[];
}): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from('reviews').insert({
    place_id: params.placeId,
    user_id: user.id,
    user_name: user.user_metadata?.name ?? user.email ?? '익명 라이더',
    rating: params.rating,
    content: params.content,
    photos: params.photos ?? [],
  });

  if (error) throw error;
}

export async function updateReview(params: {
  id: string;
  rating: number;
  content: string;
  photos?: string[];
}): Promise<void> {
  const update: any = { rating: params.rating, content: params.content };
  if (params.photos !== undefined) {
    update.photos = params.photos;
  }

  const { error } = await supabase
    .from('reviews')
    .update(update)
    .eq('id', params.id);

  if (error) throw error;
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) throw error;
}
