import type { NavTarget } from '@/lib/navigation';

type RouteParam = string | string[] | undefined;

export type NaviRouteParams = {
  lng?: RouteParam;
  lat?: RouteParam;
  name?: RouteParam;
  /** JSON "[lng,lat,...]" — 코스 안내의 경유지 */
  vias?: RouteParam;
  /** JSON NavTarget[] — 길찾기 페이지에서 미리 고른 경유지(편집 가능) */
  uvias?: RouteParam;
  /** 출발지 지정(길찾기) — 없으면 현재 위치에서 출발 */
  slng?: RouteParam;
  slat?: RouteParam;
  sname?: RouteParam;
  /** 도착 후 리뷰 연결 — 등록 장소 id / 코스 id */
  pid?: RouteParam;
  gpid?: RouteParam;
  cid?: RouteParam;
};

export interface ParsedNaviParams {
  goal: NavTarget;
  start: [number, number] | null;
  startName: string | null;
  userVias: NavTarget[];
  courseVias: number[];
  courseId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LABEL_LENGTH = 120;
const MAX_JSON_LENGTH = 4_096;
const MAX_COURSE_VIAS = 20;
const MAX_USER_VIAS = 3;

function single(value: RouteParam): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function label(value: RouteParam, fallback?: string): string | null {
  const raw = single(value);
  if (raw == null) return fallback ?? null;
  const normalized = raw.normalize('NFKC').trim();
  if (
    !normalized ||
    normalized.length > MAX_LABEL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return fallback ?? null;
  }
  return normalized;
}

function coordinate(value: RouteParam): number | null {
  const raw = single(value);
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function inKorea(latitude: number, longitude: number): boolean {
  return latitude >= 32 && latitude <= 39 && longitude >= 124 && longitude <= 132;
}

function parseCourseVias(value: RouteParam): number[] | null {
  const raw = single(value);
  if (raw == null) return [];
  if (raw.length > MAX_JSON_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length % 2 !== 0 ||
      parsed.length > MAX_COURSE_VIAS * 2
    ) {
      return null;
    }
    for (let i = 0; i < parsed.length; i += 2) {
      const longitude = parsed[i];
      const latitude = parsed[i + 1];
      if (
        typeof longitude !== 'number' ||
        typeof latitude !== 'number' ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !inKorea(latitude, longitude)
      ) {
        return null;
      }
    }
    return parsed as number[];
  } catch {
    return null;
  }
}

function parseUserVias(value: RouteParam): NavTarget[] | null {
  const raw = single(value);
  if (raw == null) return [];
  if (raw.length > MAX_JSON_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_USER_VIAS) return null;
    const result: NavTarget[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = label(typeof record.name === 'string' ? record.name : undefined);
      const latitude = record.latitude;
      const longitude = record.longitude;
      if (
        !name ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !inKorea(latitude, longitude)
      ) {
        return null;
      }
      result.push({
        name,
        latitude,
        longitude,
        ...(typeof record.placeId === 'string' && UUID.test(record.placeId)
          ? { placeId: record.placeId }
          : {}),
        ...(typeof record.generalPlaceId === 'string' && UUID.test(record.generalPlaceId)
          ? { generalPlaceId: record.generalPlaceId }
          : {}),
      });
    }
    return result;
  } catch {
    return null;
  }
}

/** 외부 딥링크도 들어올 수 있는 /navi 경계에서 모든 파라미터를 검증한다. */
export function parseNaviParams(params: NaviRouteParams): ParsedNaviParams | null {
  if (Object.values(params).some(Array.isArray)) return null;

  const longitude = coordinate(params.lng);
  const latitude = coordinate(params.lat);
  if (longitude == null || latitude == null || !inKorea(latitude, longitude)) return null;

  const startLongitude = coordinate(params.slng);
  const startLatitude = coordinate(params.slat);
  const hasStartLongitude = single(params.slng) != null;
  const hasStartLatitude = single(params.slat) != null;
  if (hasStartLongitude !== hasStartLatitude) return null;
  if (
    hasStartLongitude &&
    (startLongitude == null ||
      startLatitude == null ||
      !inKorea(startLatitude, startLongitude))
  ) {
    return null;
  }

  const courseVias = parseCourseVias(params.vias);
  const userVias = parseUserVias(params.uvias);
  if (!courseVias || !userVias) return null;

  const placeId = single(params.pid);
  const generalPlaceId = single(params.gpid);
  const courseId = single(params.cid);
  const start: [number, number] | null =
    startLongitude != null && startLatitude != null
      ? [startLongitude, startLatitude]
      : null;
  return {
    goal: {
      name: label(params.name, '목적지')!,
      latitude,
      longitude,
      ...(placeId && UUID.test(placeId) ? { placeId } : {}),
      ...(!placeId && generalPlaceId && UUID.test(generalPlaceId)
        ? { generalPlaceId }
        : {}),
    },
    start,
    startName: start ? label(params.sname, '출발지') : null,
    userVias,
    courseVias,
    ...(courseId && UUID.test(courseId) ? { courseId } : {}),
  };
}
