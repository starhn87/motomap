import type { RideSession } from '@/lib/api/rideSessions';
import { ridePointDistance, type RidePathPoint } from '@/lib/ridePath';

export interface RidePlaybackEntry {
  key: string;
  sessionId: string;
  sessionIndex: number;
  segmentIndex: number;
  coords: { latitude: number; longitude: number }[];
  points: RidePathPoint[];
  cumulativeMeters: number[];
  distanceM: number;
  startsAtMs: number;
  endsAtMs: number;
}

export interface RidePlaybackTimeline {
  entries: RidePlaybackEntry[];
  durationMs: number;
}

const SEGMENT_GAP_MS = 220;
const SESSION_GAP_MS = 520;
const MIN_SEGMENT_MS = 240;

function buildCumulativeMeters(points: RidePathPoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + ridePointDistance(points[index - 1], points[index]));
  }
  return cumulative;
}

/**
 * 실제 시간의 정차 구간은 압축하고 경로 길이에 비례해 전체를 목표 시간 안에 배분한다.
 * 세션·끊긴 선분 사이에는 짧은 공백을 둬 존재하지 않는 이동선을 만들지 않는다.
 */
export function buildRidePlaybackTimeline(
  sessions: RideSession[],
  targetDurationMs = 24_000,
): RidePlaybackTimeline {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const source = ordered.flatMap((session, sessionIndex) =>
    session.pathSegments.map((points, segmentIndex) => {
      const cumulativeMeters = buildCumulativeMeters(points);
      return {
        key: `${session.id}:${segmentIndex}`,
        sessionId: session.id,
        sessionIndex,
        segmentIndex,
        points,
        coords: points.map((point) => ({ longitude: point[0], latitude: point[1] })),
        cumulativeMeters,
        distanceM: cumulativeMeters[cumulativeMeters.length - 1] ?? 0,
      };
    }),
  );
  if (source.length === 0) return { entries: [], durationMs: 0 };

  let gapBudget = 0;
  for (let index = 1; index < source.length; index += 1) {
    gapBudget += source[index - 1].sessionId === source[index].sessionId
      ? SEGMENT_GAP_MS
      : SESSION_GAP_MS;
  }
  const drawableBudget = Math.max(
    source.length * MIN_SEGMENT_MS,
    targetDurationMs - gapBudget,
  );
  const totalDistance = source.reduce((total, entry) => total + Math.max(1, entry.distanceM), 0);
  let cursorMs = 0;

  const entries: RidePlaybackEntry[] = source.map((entry, index) => {
    if (index > 0) {
      cursorMs += source[index - 1].sessionId === entry.sessionId
        ? SEGMENT_GAP_MS
        : SESSION_GAP_MS;
    }
    const proportionalMs = drawableBudget * (Math.max(1, entry.distanceM) / totalDistance);
    const segmentDurationMs = Math.max(MIN_SEGMENT_MS, proportionalMs);
    const result: RidePlaybackEntry = {
      ...entry,
      startsAtMs: cursorMs,
      endsAtMs: cursorMs + segmentDurationMs,
    };
    cursorMs = result.endsAtMs;
    return result;
  });

  return { entries, durationMs: Math.round(cursorMs) };
}

export function ridePlaybackProgress(entry: RidePlaybackEntry, elapsedMs: number): number {
  if (elapsedMs <= entry.startsAtMs) return 0;
  if (elapsedMs >= entry.endsAtMs) return 1;
  return (elapsedMs - entry.startsAtMs) / (entry.endsAtMs - entry.startsAtMs);
}

export function ridePlaybackPoint(
  entry: RidePlaybackEntry,
  progress: number,
): { latitude: number; longitude: number } | null {
  if (entry.points.length === 0 || progress <= 0 || progress >= 1) {
    const point = progress >= 1 ? entry.points[entry.points.length - 1] : entry.points[0];
    return point ? { longitude: point[0], latitude: point[1] } : null;
  }
  const target = entry.distanceM * progress;
  let index = 1;
  while (index < entry.cumulativeMeters.length && entry.cumulativeMeters[index] < target) {
    index += 1;
  }
  if (index >= entry.points.length) {
    const point = entry.points[entry.points.length - 1];
    return { longitude: point[0], latitude: point[1] };
  }
  const previousDistance = entry.cumulativeMeters[index - 1];
  const nextDistance = entry.cumulativeMeters[index];
  const ratio = nextDistance === previousDistance
    ? 0
    : (target - previousDistance) / (nextDistance - previousDistance);
  const previous = entry.points[index - 1];
  const next = entry.points[index];
  return {
    longitude: previous[0] + (next[0] - previous[0]) * ratio,
    latitude: previous[1] + (next[1] - previous[1]) * ratio,
  };
}

export function activeRidePlaybackEntry(
  timeline: RidePlaybackTimeline,
  elapsedMs: number,
): RidePlaybackEntry | null {
  return timeline.entries.find(
    (entry) => elapsedMs >= entry.startsAtMs && elapsedMs <= entry.endsAtMs,
  ) ?? null;
}
