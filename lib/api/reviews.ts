import { supabase } from '@/lib/supabase';
import type { Review } from '@/types';

export async function fetchReviews(placeId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, profiles(nickname, avatar_url)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    userName: row.profiles?.nickname ?? row.user_name,
    avatarUrl: row.profiles?.avatar_url ?? null,
    rating: row.rating,
    content: row.content ?? '',
    photos: row.photos ?? [],
    createdAt: row.created_at,
  }));
}

export async function createReview(params: {
  placeId: string;
  rating: number;
  content: string;
  photos?: string[];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

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
