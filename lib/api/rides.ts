import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

// 장소별 라이딩 기록 — 길안내를 그 장소(도착지/경유지)로 마치고 도착지 300m
// 안에서 끝났을 때 1회. 기록은 로그인 라이더만(RLS), 카운트 조회는 누구나.

export interface PlaceRide {
  place_id: string;
  role: 'goal' | 'via';
}

/**
 * 도착 라이딩 기록. 비로그인이거나 실패해도 조용히 넘어간다 —
 * 통계가 안내 종료 흐름(리뷰 제안 등)을 방해하면 안 된다.
 */
export async function recordPlaceRides(rides: PlaceRide[]) {
  if (rides.length === 0) return;
  try {
    const user = await getCurrentUser();
    if (!user) return;
    await supabase.from('place_rides').insert(rides.map((r) => ({ ...r, user_id: user.id })));
  } catch {
    // 테이블 미생성·네트워크 실패 등 — 카운트 하나 빠질 뿐이다
  }
}

/** 장소의 누적 라이딩 횟수 (도착 + 경유) */
export async function fetchPlaceRideCount(placeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('place_rides')
    .select('*', { count: 'exact', head: true })
    .eq('place_id', placeId);
  if (error) return 0;
  return count ?? 0;
}
