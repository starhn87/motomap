import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getProfile } from '@/lib/nickname';
import { BIKE_SPECS, canonicalBikeModel } from '@/constants/bikes';
import type { PlaceCategory } from '@/types';

// 장소별 라이딩 기록 — 길안내를 그 장소(도착지/경유지)로 마치고 도착지 300m
// 안에서 끝났을 때 1회. 기록은 로그인 라이더만(RLS), 집계 조회는 누구나(RPC).

/**
 * 기록 대상 — 등록 장소는 place_id 로, 일반 장소는 이름+좌표로 남긴다(037).
 * 일반 장소분은 앱에 표시하지 않는다: 진입 경로마다 좌표가 미세하게 달라
 * 사람 간 집계가 과소계상된다. 미등록 장소 발굴(주간 다이제스트) 전용이다.
 */
export type PlaceRide =
  | { role: 'goal' | 'via'; place_id: string }
  | {
      role: 'goal' | 'via';
      name: string;
      latitude: number;
      longitude: number;
      general_place_id?: string;
    };

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
    const bikeKey = bike_model
      ? canonicalBikeModel(bike_model) ?? bike_model.trim()
      : null;
    const bike_category = bikeKey ? BIKE_SPECS[bikeKey]?.category ?? null : null;
    await supabase
      .from('place_rides')
      .insert(rides.map((r) => ({ ...r, user_id: user.id, bike_model, bike_category })));
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

export interface MyRideBreakdown {
  goals: number;
  vias: number;
  total: number;
  lastAt: string;
}

/** 장소별 내 라이딩 — 라이딩 기록 화면의 한 행 */
export interface MyRidePlace extends MyRideBreakdown {
  /** 등록 장소면 id, 미등록 일반 장소면 null */
  placeId: string | null;
  generalPlaceId: string | null;
  name: string;
  /** 미등록 장소의 기록 좌표 — 지도 포커스용 (등록 장소는 null, id 로 간다) */
  latitude: number | null;
  longitude: number | null;
  category: PlaceCategory | null;
  /** 기록 당시 기종별 횟수 — 현재 프로필 기종을 바꿔도 과거 기록은 유지된다 */
  byBike: Record<string, MyRideBreakdown>;
}

/**
 * 어디를 몇 번 갔는지 — 내 원시 기록(RLS 로 본인 행만)을 장소별로 묶는다.
 * 등록 장소명은 조인으로 현재 이름을, 미등록 장소는 기록 당시 이름을 쓴다.
 */
export async function fetchMyRides(): Promise<MyRidePlace[]> {
  const { data, error } = await supabase
    .from('place_rides')
    .select('place_id, general_place_id, name, latitude, longitude, role, bike_model, created_at, places(name, category)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  const byPlace = new Map<string, MyRidePlace>();
  for (const r of data as any[]) {
    const name = r.places?.name ?? r.name ?? '이름 없는 장소';
    // 미등록 장소는 이름으로 묶는다 — 같은 곳을 여러 번 가면 좌표가 미세하게
    // 달라도 이름은 같다(내 기록이라 진입 경로가 하나뿐인 것도 한몫)
    const key = r.place_id ?? r.general_place_id ?? `pt:${name}`;
    const cur: MyRidePlace = byPlace.get(key) ?? {
      placeId: r.place_id ?? null,
      generalPlaceId: r.general_place_id ?? null,
      name,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      category: r.places?.category ?? null,
      goals: 0,
      vias: 0,
      total: 0,
      lastAt: r.created_at,
      byBike: {},
    };
    cur.total += 1;
    if (r.role === 'via') cur.vias += 1;
    else cur.goals += 1;
    const bike = typeof r.bike_model === 'string' ? r.bike_model.trim() : '';
    if (bike) {
      const bikeRide = cur.byBike[bike] ?? {
        goals: 0,
        vias: 0,
        total: 0,
        lastAt: r.created_at,
      };
      bikeRide.total += 1;
      if (r.role === 'via') bikeRide.vias += 1;
      else bikeRide.goals += 1;
      cur.byBike[bike] = bikeRide;
    }
    byPlace.set(key, cur);
  }
  // 많이 간 곳 먼저, 동률이면 최근에 간 곳 먼저 (조회가 created_at 내림차순이라
  // lastAt 은 처음 만든 행의 값이 곧 최신이다)
  return [...byPlace.values()].sort(
    (a, b) => b.total - a.total || b.lastAt.localeCompare(a.lastAt),
  );
}

/** 내 라이딩 통계 — 내 바이크 화면의 기록 카드 */
export async function fetchMyRideStats(): Promise<MyRideStats> {
  const { data, error } = await supabase.rpc('my_ride_stats');
  if (error || !data) return EMPTY_MY_RIDE_STATS;
  return { rides: data.rides ?? 0, places: data.places ?? 0, bikes: data.bikes ?? [] };
}
