import type { Ride } from '@/types';

export interface RideStatsBucket {
  distanceKm: number;
  durationSec: number;
  count: number;
}

export interface WeeklyPoint {
  weekStartMs: number;
  distanceKm: number;
}

export interface RideStats {
  thisWeek: RideStatsBucket;
  thisMonth: RideStatsBucket;
  total: RideStatsBucket;
  weeklyTrend: WeeklyPoint[]; // 최근 8주(오래된 → 최신)
}

const TREND_WEEKS = 8;

function emptyBucket(): RideStatsBucket {
  return { distanceKm: 0, durationSec: 0, count: 0 };
}

function add(bucket: RideStatsBucket, ride: Ride): void {
  bucket.distanceKm += ride.distance;
  bucket.durationSec += ride.duration;
  bucket.count += 1;
}

// 이번 주 시작(월요일 0시) 시각
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0=일 … 6=토
  const backToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - backToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeRideStats(rides: Ride[]): RideStats {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendStart = new Date(weekStart);
  trendStart.setDate(weekStart.getDate() - (TREND_WEEKS - 1) * 7);

  const thisWeek = emptyBucket();
  const thisMonth = emptyBucket();
  const total = emptyBucket();
  const trend: WeeklyPoint[] = Array.from({ length: TREND_WEEKS }, (_, i) => ({
    weekStartMs: trendStart.getTime() + i * 7 * 86400000,
    distanceKm: 0,
  }));

  for (const ride of rides) {
    const t = new Date(ride.createdAt).getTime();
    add(total, ride);
    if (t >= monthStart.getTime()) add(thisMonth, ride);
    if (t >= weekStart.getTime()) add(thisWeek, ride);
    // 추이: 8주 범위 안이면 해당 주 버킷에 거리 누적
    if (t >= trendStart.getTime()) {
      const idx = Math.floor((t - trendStart.getTime()) / (7 * 86400000));
      if (idx >= 0 && idx < TREND_WEEKS) trend[idx].distanceKm += ride.distance;
    }
  }

  return { thisWeek, thisMonth, total, weeklyTrend: trend };
}
