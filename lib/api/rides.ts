import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getProfile } from '@/lib/nickname';

// 장소별 라이딩 기록 — 길안내를 그 장소(도착지/경유지)로 마치고 도착지 300m
// 안에서 끝났을 때 1회. 기록은 로그인 라이더만(RLS), 집계 조회는 누구나(RPC).

export interface PlaceRide {
  place_id: string;
  role: 'goal' | 'via';
}

export interface RideBike {
  model: string;
  riders: number;
}

export interface PlaceRideSummary {
  /** 누적 라이딩 횟수 (도착 + 경유) */
  total: number;
  /** 기종별 라이더 수 — 많은 순 최대 5종 */
  bikes: RideBike[];
}

export const EMPTY_RIDE_SUMMARY: PlaceRideSummary = { total: 0, bikes: [] };

/**
 * 도착 라이딩 기록. 비로그인이거나 실패해도 조용히 넘어간다 —
 * 통계가 안내 종료 흐름(리뷰 제안 등)을 방해하면 안 된다.
 */
export async function recordPlaceRides(rides: PlaceRide[]) {
  if (rides.length === 0) return;
  try {
    const user = await getCurrentUser();
    if (!user) return;
    // 그때 탄 바이크를 함께 남긴다 — 나중에 기종을 바꿔도 과거 기록은 그대로여야 한다
    const bike_model = (await getProfile())?.bike_model ?? null;
    await supabase
      .from('place_rides')
      .insert(rides.map((r) => ({ ...r, user_id: user.id, bike_model })));
  } catch {
    // 테이블 미생성·네트워크 실패 등 — 카운트 하나 빠질 뿐이다
  }
}

/** 장소의 누적 라이딩 횟수와 어떤 바이크들이 다녀갔는지 */
export async function fetchPlaceRideSummary(placeId: string): Promise<PlaceRideSummary> {
  const { data, error } = await supabase.rpc('place_ride_summary', { p_place_id: placeId });
  if (error || !data) return EMPTY_RIDE_SUMMARY;
  return { total: data.total ?? 0, bikes: data.bikes ?? [] };
}

export interface MyRideStats {
  rides: number;
  places: number;
  bikes: { model: string; rides: number }[];
}

export const EMPTY_MY_RIDE_STATS: MyRideStats = { rides: 0, places: 0, bikes: [] };

/** 내 라이딩 통계 — 내 바이크 화면의 기록 카드 */
export async function fetchMyRideStats(): Promise<MyRideStats> {
  const { data, error } = await supabase.rpc('my_ride_stats');
  if (error || !data) return EMPTY_MY_RIDE_STATS;
  return { rides: data.rides ?? 0, places: data.places ?? 0, bikes: data.bikes ?? [] };
}
