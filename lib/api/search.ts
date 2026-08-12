import { supabase } from '@/lib/supabase';
import { useMapStore } from '@/stores/useMapStore';
import type { Place, RidingCourse } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';

export interface SearchResults {
  places: Place[];
  courses: RidingCourse[];
}

// 등록 장소와 카카오 일반 장소가 같은 곳인지 — 이름(정규화) 일치 + 좌표 근접.
// 제보 폼이 카카오 좌표를 그대로 쓰므로 20m 이내는 이름이 조금 달라도 동일 장소다.
const normName = (n: string) => n.replace(/\s/g, '').toLowerCase();
export function isSamePlace(
  p: { name: string; latitude: number; longitude: number },
  k: { name: string; latitude: number; longitude: number },
): boolean {
  const dist = Math.hypot((p.latitude - k.latitude) * 111000, (p.longitude - k.longitude) * 88000);
  if (dist > 150) return false;
  if (dist < 20) return true;
  const pn = normName(p.name);
  const kn = normName(k.name);
  return kn === pn || kn.includes(pn) || pn.includes(kn);
}

/**
 * 검색어가 이 필드들에 걸리는지.
 *
 * 장소 이름의 띄어쓰기는 제보한 사람마다 다르다("더티트렁크" vs "더티 트렁크") —
 * 공백을 지운 통짜끼리 비교해 그 차이를 없앤다. 여러 낱말을 친 경우엔
 * 전부 들어 있기만 하면 걸리게 한다("파주 카페" → 파주·카페가 다 있는 곳).
 */
function matches(query: string, fields: (string | null | undefined)[]): boolean {
  const hay = fields.filter(Boolean).join(' ').toLowerCase().replace(/\s/g, '');
  const q = query.toLowerCase();
  if (hay.includes(q.replace(/\s/g, ''))) return true;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((w) => hay.includes(w));
}

export async function searchAll(
  query: string,
  /** 있으면 이 좌표(보통 지금 보는 지도 중심)에서 가까운 순으로 정렬한다.
      이름 매칭을 통과한 결과끼리의 순위라 관련성은 이미 확보돼 있다. */
  near?: { latitude: number; longitude: number },
): Promise<SearchResults> {
  const [placesRes, coursesRes] = await Promise.all([
    supabase.rpc('all_places', { category_filter: null }),
    supabase
      .from('courses')
      .select('*')
      .eq('approved', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const distTo = near
    ? (lat: number, lng: number) =>
        Math.hypot((lat - near.latitude) * 111000, (lng - near.longitude) * 88000)
    : null;
  // "지금 보는 지역"의 실질 반경 — 시 단위 생활권 20km(강릉이면 주문진·정동진까지).
  // 처음 50km 로 잡았더니 여전히 멀게 느껴진다는 피드백에 좁혔다. 정렬만으로는
  // 전국 매칭이 꼬리로 딸려 와 소용이 없었던 것도 실사용 피드백.
  const SEARCH_RADIUS_M = 20_000;

  let places = (placesRes.data ?? [])
    .filter((row: PlaceRow) => matches(query, [row.name, row.address, ...(row.tags ?? [])]))
    .map(rowToPlace);
  if (distTo) {
    places.sort(
      (a: Place, b: Place) => distTo(a.latitude, a.longitude) - distTo(b.latitude, b.longitude),
    );
    // 반경 안만 남긴다 — 단, 주변에 하나도 없으면 전국 결과를 거리순 그대로 둔다
    // ("부산 카페"처럼 지역을 명시한 검색이 빈손이 되지 않게)
    const within = places.filter((p: Place) => distTo(p.latitude, p.longitude) <= SEARCH_RADIUS_M);
    if (within.length > 0) places = within;
  }

  let courses = (coursesRes.data ?? [])
    .filter((row: any) => matches(query, [row.name, row.description, ...(row.tags ?? [])]))
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      distance: Number(row.distance),
      duration: row.duration,
      coordinates: row.coordinates ?? [],
      sectionFrom: row.section_from ?? null,
      sectionTo: row.section_to ?? null,
      routeName: row.route_name ?? null,
    routeGeometry: row.route_geometry ?? null,
      waypoints: [],
      tags: row.tags ?? [],
      createdBy: row.created_by,
      rating: Number(row.rating) || 0,
      reviewCount: row.review_count ?? 0,
      createdAt: row.created_at,
    }));

  if (distTo) {
    // 코스는 경로 시작점 기준 — 같은 반경·폴백 규칙
    const courseDist = (c: RidingCourse) => {
      const p = c.coordinates[0];
      return p ? distTo(p[1], p[0]) : Number.POSITIVE_INFINITY;
    };
    courses.sort((a: RidingCourse, b: RidingCourse) => courseDist(a) - courseDist(b));
    const within = courses.filter((c: RidingCourse) => courseDist(c) <= SEARCH_RADIUS_M);
    if (within.length > 0) courses = within;
  }

  return { places, courses };
}

/**
 * 검색 기준점 — 마지막으로 본 지도 중심, 없으면 내 위치. 세 검색 화면(통합 검색·
 * 검색 결과·지점 모달)이 같은 기준을 쓰도록 여기 한곳에 둔다. 반환의 key 는
 * react-query 캐시 키용 근사값(±1km) — 미세한 지도 이동마다 재검색하지 않는다.
 */
export function useSearchAnchor(): {
  near: { latitude: number; longitude: number } | undefined;
  key: string;
} {
  const mapCenter = useMapStore((s) => s.mapCenter);
  const userLocation = useMapStore((s) => s.userLocation);
  const near = mapCenter ?? userLocation ?? undefined;
  return {
    near,
    key: near ? `${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}` : 'none',
  };
}
