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

  const places = (placesRes.data ?? [])
    .filter((row: PlaceRow) => matches(query, [row.name, row.address, ...(row.tags ?? [])]))
    .map(rowToPlace);
  if (distTo) {
    places.sort(
      (a: Place, b: Place) => distTo(a.latitude, a.longitude) - distTo(b.latitude, b.longitude),
    );
  }

  const courses = (coursesRes.data ?? [])
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
    // 코스는 경로 시작점 기준 — 가까운 지역 코스가 먼저 온다
    courses.sort((a: RidingCourse, b: RidingCourse) => {
      const ca = a.coordinates[0];
      const cb = b.coordinates[0];
      if (!ca || !cb) return ca ? -1 : cb ? 1 : 0;
      return distTo(ca[1], ca[0]) - distTo(cb[1], cb[0]);
    });
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
