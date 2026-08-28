import { haversine } from '@/lib/distance';

/** 저장·재생 공통 경로 점: [경도, 위도, 세션 시작 뒤 경과 ms] */
export type RidePathPoint = [number, number, number];
export type RidePathSegment = RidePathPoint[];
export type RidePathSegments = RidePathSegment[];

export interface RidePathBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

const LATITUDE_METERS = 111_000;
// 모토맵의 국내 주행 범위에서 단순화 계산에 충분한 경도 근사값이다.
const LONGITUDE_METERS = 88_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRidePathPoint(value: unknown): value is RidePathPoint {
  return Array.isArray(value)
    && value.length === 3
    && isFiniteNumber(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && isFiniteNumber(value[1])
    && value[1] >= -90
    && value[1] <= 90
    && isFiniteNumber(value[2])
    && value[2] >= 0;
}

/** Data API의 JSON을 지도에 넘기기 전에 다시 검증한다. */
export function parseRidePathSegments(value: unknown): RidePathSegments | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) return null;
  const segments: RidePathSegments = [];
  let previousElapsed = -1;
  let pointCount = 0;

  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length < 2 || candidate.length > 20_000) {
      return null;
    }
    const segment: RidePathSegment = [];
    for (const point of candidate) {
      if (!isRidePathPoint(point) || point[2] < previousElapsed) return null;
      segment.push([point[0], point[1], Math.round(point[2])]);
      previousElapsed = point[2];
      pointCount += 1;
      if (pointCount > 50_000) return null;
    }
    segments.push(segment);
  }
  return segments;
}

export function ridePointDistance(a: RidePathPoint, b: RidePathPoint): number {
  return haversine(
    { longitude: a[0], latitude: a[1] },
    { longitude: b[0], latitude: b[1] },
  );
}

export function rideSegmentsDistance(segments: RidePathSegments): number {
  let distance = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index += 1) {
      distance += ridePointDistance(segment[index - 1], segment[index]);
    }
  }
  return distance;
}

/** 정차 노이즈는 제외하고 실제 이동이 있었던 좌표 사이의 시간만 합산한다. */
export function rideSegmentsMovingDuration(segments: RidePathSegments): number {
  let durationMs = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const current = segment[index];
      if (ridePointDistance(previous, current) < 3) continue;
      durationMs += Math.min(30_000, Math.max(0, current[2] - previous[2]));
    }
  }
  return Math.round(durationMs / 1000);
}

function perpendicularMeters(
  point: RidePathPoint,
  start: RidePathPoint,
  end: RidePathPoint,
): number {
  const x = point[0] * LONGITUDE_METERS;
  const y = point[1] * LATITUDE_METERS;
  const startX = start[0] * LONGITUDE_METERS;
  const startY = start[1] * LATITUDE_METERS;
  const endX = end[0] * LONGITUDE_METERS;
  const endY = end[1] * LATITUDE_METERS;
  const dx = endX - startX;
  const dy = endY - startY;
  if (dx === 0 && dy === 0) return Math.hypot(x - startX, y - startY);
  const ratio = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (startX + ratio * dx), y - (startY + ratio * dy));
}

/** Douglas–Peucker 단순화. 경과 시간은 선택된 원래 점의 값을 그대로 보존한다. */
export function simplifyRideSegment(
  segment: RidePathSegment,
  toleranceMeters = 12,
): RidePathSegment {
  if (segment.length <= 2) return segment.map((point) => [...point]);
  const keep = new Uint8Array(segment.length);
  keep[0] = 1;
  keep[segment.length - 1] = 1;
  const ranges: [number, number][] = [[0, segment.length - 1]];

  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    let furthestIndex = -1;
    let furthestDistance = toleranceMeters;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularMeters(
        segment[index],
        segment[startIndex],
        segment[endIndex],
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex < 0) continue;
    keep[furthestIndex] = 1;
    ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }

  return segment.filter((_, index) => keep[index]).map((point) => [...point]);
}

export function simplifyRideSegments(
  segments: RidePathSegments,
  toleranceMeters = 12,
): RidePathSegments {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => simplifyRideSegment(segment, toleranceMeters));
}

export function ridePathBounds(segments: RidePathSegments): RidePathBounds | null {
  let bounds: RidePathBounds | null = null;
  for (const segment of segments) {
    for (const point of segment) {
      if (!bounds) {
        bounds = {
          minLatitude: point[1],
          maxLatitude: point[1],
          minLongitude: point[0],
          maxLongitude: point[0],
        };
        continue;
      }
      bounds.minLatitude = Math.min(bounds.minLatitude, point[1]);
      bounds.maxLatitude = Math.max(bounds.maxLatitude, point[1]);
      bounds.minLongitude = Math.min(bounds.minLongitude, point[0]);
      bounds.maxLongitude = Math.max(bounds.maxLongitude, point[0]);
    }
  }
  return bounds;
}

export function ridePathPointCount(segments: RidePathSegments): number {
  return segments.reduce((total, segment) => total + segment.length, 0);
}
