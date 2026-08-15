import { supabase } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';
import type { HazardType, RoadHazard } from '@/types';

// RPC 가 돌려주는 행 (PostGIS location 을 lat/lng 로 풀어서 준다)
interface HazardRow {
  id: string;
  type: HazardType;
  note: string | null;
  photo: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  last_confirmed_at: string;
  confirm_count: number;
  resolved_count: number;
  staleness: number;
}

function rowToHazard(row: HazardRow): RoadHazard {
  return {
    id: row.id,
    type: row.type,
    note: row.note,
    photo: row.photo,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    lastConfirmedAt: row.last_confirmed_at,
    confirmCount: row.confirm_count,
    resolvedCount: row.resolved_count,
    staleness: row.staleness,
  };
}

export async function fetchNearbyHazards(
  latitude: number,
  longitude: number,
  radiusMeters = 20_000
): Promise<RoadHazard[]> {
  const { data, error } = await supabase.rpc('nearby_hazards', {
    lat: latitude,
    lng: longitude,
    radius_meters: radiusMeters,
  });
  if (error) throw error;
  return (data ?? []).map(rowToHazard);
}

/** 코스 경로선 주변 위험 — 코스 진행 순서로 온다 */
export async function fetchHazardsNearCourse(
  courseId: string
): Promise<{ hazard: RoadHazard; routeFraction: number }[]> {
  const { data, error } = await supabase.rpc('hazards_near_course', {
    course_id: courseId,
  });
  if (error) throw error;
  return ((data ?? []) as (HazardRow & { route_fraction: number })[]).map((row) => ({
    hazard: rowToHazard(row),
    routeFraction: row.route_fraction,
  }));
}

export async function submitHazard(params: {
  type: HazardType;
  latitude: number;
  longitude: number;
  address?: string;
  note?: string;
  photo?: string;
}): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase.from('road_hazards').insert({
    type: params.type,
    location: `POINT(${params.longitude} ${params.latitude})`,
    address: params.address ?? null,
    note: params.note?.trim() || null,
    photo: params.photo ?? null,
    reported_by: user.id,
  });
  if (error) throw error;
}

/** "아직 있어요"(confirm) / "없어졌어요"(resolve) — 한 사람 한 표 */
export async function voteHazard(hazardId: string, kind: 'confirm' | 'resolve'): Promise<void> {
  await requireUser();
  const { error } = await supabase.rpc('vote_hazard', {
    p_hazard_id: hazardId,
    p_kind: kind,
  });
  if (error) throw error;
}
