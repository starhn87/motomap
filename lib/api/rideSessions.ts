import { requireUser } from '@/lib/auth';
import type { Json } from '@/lib/database.types';
import {
  parseRidePathSegments,
  type RidePathSegments,
} from '@/lib/ridePath';
import { supabase } from '@/lib/supabase';

export type RideSessionEndReason = 'arrived' | 'cancelled' | 'interrupted';

export interface RideSession {
  id: string;
  bikeId: string | null;
  bikeModel: string | null;
  bikeNickname: string | null;
  goalPlaceId: string | null;
  goalGeneralPlaceId: string | null;
  goalName: string;
  goalLatitude: number;
  goalLongitude: number;
  startedAt: string;
  endedAt: string;
  endedReason: RideSessionEndReason;
  isPartial: boolean;
  distanceM: number;
  durationS: number;
  movingDurationS: number;
  pointCount: number;
  segmentCount: number;
  pathSegments: RidePathSegments;
}

export interface RideSessionInsert {
  id: string;
  userId: string;
  consentId: string;
  bikeId: string | null;
  bikeModel: string | null;
  bikeNickname: string | null;
  goalPlaceId: string | null;
  goalGeneralPlaceId: string | null;
  goalName: string;
  goalLatitude: number;
  goalLongitude: number;
  startedAt: string;
  endedAt: string;
  endedReason: RideSessionEndReason;
  isPartial: boolean;
  distanceM: number;
  durationS: number;
  movingDurationS: number;
  pathSegments: RidePathSegments;
}

export interface RideSessionQuery {
  from: string;
  to: string;
  bikeId?: string | null;
  before?: string;
  limit?: number;
}

const RIDE_SESSION_SELECT = [
  'id',
  'bike_id',
  'bike_model',
  'bike_nickname',
  'goal_place_id',
  'goal_general_place_id',
  'goal_name',
  'goal_latitude',
  'goal_longitude',
  'started_at',
  'ended_at',
  'ended_reason',
  'is_partial',
  'distance_m',
  'duration_s',
  'moving_duration_s',
  'point_count',
  'segment_count',
  'path_segments',
].join(',');

function toRideSession(row: any): RideSession | null {
  const pathSegments = parseRidePathSegments(row.path_segments);
  if (!pathSegments) return null;
  return {
    id: row.id,
    bikeId: row.bike_id ?? null,
    bikeModel: row.bike_model ?? null,
    bikeNickname: row.bike_nickname ?? null,
    goalPlaceId: row.goal_place_id ?? null,
    goalGeneralPlaceId: row.goal_general_place_id ?? null,
    goalName: row.goal_name,
    goalLatitude: row.goal_latitude,
    goalLongitude: row.goal_longitude,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endedReason: row.ended_reason,
    isPartial: row.is_partial,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    movingDurationS: row.moving_duration_s,
    pointCount: row.point_count,
    segmentCount: row.segment_count,
    pathSegments,
  };
}

/** 완료된 세션은 불변이다. 중복 UUID는 오프라인 재시도 성공으로 본다. */
export async function insertRideSession(session: RideSessionInsert): Promise<void> {
  const user = await requireUser();
  if (user.id !== session.userId) throw new Error('라이딩 기록의 사용자가 일치하지 않습니다.');
  const { error } = await supabase.from('ride_sessions').insert({
    id: session.id,
    user_id: session.userId,
    consent_id: session.consentId,
    bike_id: session.bikeId,
    bike_model: session.bikeModel,
    bike_nickname: session.bikeNickname,
    goal_place_id: session.goalPlaceId,
    goal_general_place_id: session.goalGeneralPlaceId,
    goal_name: session.goalName,
    goal_latitude: session.goalLatitude,
    goal_longitude: session.goalLongitude,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    ended_reason: session.endedReason,
    is_partial: session.isPartial,
    distance_m: session.distanceM,
    duration_s: session.durationS,
    moving_duration_s: session.movingDurationS,
    path_segments: session.pathSegments as unknown as Json,
  });
  if (error && error.code !== '23505') throw error;
}

/** 시작 시각 커서를 이용해 기간이 길어져도 뒤쪽 페이지 비용이 늘지 않게 한다. */
export async function fetchRideSessionPage(query: RideSessionQuery): Promise<RideSession[]> {
  let request = supabase
    .from('ride_sessions')
    .select(RIDE_SESSION_SELECT)
    .gte('started_at', query.from)
    .lte('started_at', query.to)
    .order('started_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, query.limit ?? 40)));
  if (query.bikeId) request = request.eq('bike_id', query.bikeId);
  if (query.before) request = request.lt('started_at', query.before);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const session = toRideSession(row);
    return session ? [session] : [];
  });
}

export async function fetchRideSessions(
  query: Omit<RideSessionQuery, 'before' | 'limit'>,
): Promise<RideSession[]> {
  const sessions: RideSession[] = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const next = await fetchRideSessionPage({ ...query, before, limit: 100 });
    sessions.push(...next);
    if (next.length < 100) break;
    before = next[next.length - 1].startedAt;
  }
  return sessions;
}

export async function fetchRideSession(id: string): Promise<RideSession | null> {
  const { data, error } = await supabase
    .from('ride_sessions')
    .select(RIDE_SESSION_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toRideSession(data) : null;
}

export async function deleteRideSession(id: string): Promise<void> {
  const { error } = await supabase.from('ride_sessions').delete().eq('id', id);
  if (error) throw error;
}
