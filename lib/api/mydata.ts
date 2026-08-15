import { supabase } from '@/lib/supabase';
import type { Place, Review, RidingCourse } from '@/types';
import { rowToPlace } from '@/lib/api/places';
import { rowToCourse } from '@/lib/api/courses';
import { getCurrentUser } from '@/lib/auth';

/** 내 제보 — 반려(soft delete)된 것도 사유와 함께 포함한다 */
export type MySubmission = Place & { rejected: boolean; rejectedReason: string | null };

export async function fetchMySubmissions(): Promise<MySubmission[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    // places 테이블 직접 조회는 PostGIS location 을 주므로 좌표를 풀어서 rowToPlace 에 넘긴다
    let latitude = 0;
    let longitude = 0;
    if (row.location && typeof row.location === 'object') {
      longitude = row.location.coordinates?.[0] ?? 0;
      latitude = row.location.coordinates?.[1] ?? 0;
    }
    return {
      ...rowToPlace({ ...row, latitude, longitude }),
      rejected: row.deleted_at != null,
      rejectedReason: row.rejected_reason ?? null,
    };
  });
}

/** 내 코스 제보 — 장소와 같은 3상태(대기/승인/반려). approved 는 목록 RPC 가
 * 아닌 직접 조회라 행에서 꺼낸다. */
export type MyCourseSubmission = RidingCourse & {
  approved: boolean;
  rejected: boolean;
  rejectedReason: string | null;
};

export async function fetchMyCourseSubmissions(): Promise<MyCourseSubmission[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...rowToCourse(row),
    approved: !!row.approved,
    rejected: row.deleted_at != null,
    rejectedReason: row.rejected_reason ?? null,
  }));
}

export const MY_REVIEWS_PAGE_SIZE = 20;

export async function fetchMyReviews(
  page = 0
): Promise<(Review & { placeName: string })[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const from = page * MY_REVIEWS_PAGE_SIZE;
  const { data, error } = await supabase
    .from('reviews')
    .select('*, places(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + MY_REVIEWS_PAGE_SIZE - 1);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    userName: row.user_name,
    avatarUrl: null,
    bikeModel: row.bike_model ?? null,
    rating: row.rating,
    content: row.content ?? '',
    photos: row.photos ?? [],
    createdAt: row.created_at,
    likeCount: row.like_count ?? 0,
    likedByMe: false, // 내 리뷰라 표시하지 않는다
    placeName: row.places?.name ?? '알 수 없는 장소',
  }));
}
