import { supabase } from '@/lib/supabase';
import { approxMeters } from '@/lib/distance';
import type { Place, RidingCourse } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import { CATEGORIES } from '@/constants/categories';

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
  const dist = approxMeters(p, k);
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
const SEARCH_SYNONYMS: Record<string, string[]> = {
  바이크샵: ['바이크샵', '바이크사', '오토바이샵', '정비', '수리'],
  오토바이샵: ['오토바이샵', '바이크샵', '바이크사', '정비', '수리'],
  오토바이센터: ['오토바이센터', '바이크사', '정비', '수리'],
  정비소: ['정비소', '바이크사', '정비', '수리'],
  세차장: ['세차장', '세차'],
  바이크주차: ['바이크주차', '오토바이주차', '주차'],
  오토바이주차: ['오토바이주차', '바이크주차', '주차'],
  헬멧보관: ['헬멧보관', '헬멧보관함', '보관함'],
  고급유: ['고급유', '고급휘발유'],
  야간: ['야간', '밤', '심야', '24시간'],
};

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s·._-]/g, '');
}

function alternatives(word: string): string[] {
  return (SEARCH_SYNONYMS[compact(word)] ?? [word]).map(compact);
}

/** 관련성 점수. null이면 검색어와 무관하다. 거리는 같은 점수 안에서만 순위를 가른다. */
function matchScore(
  query: string,
  fields: {
    name: string;
    address?: string | null;
    tags?: string[] | null;
    extra?: (string | null | undefined)[];
  },
): number | null {
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const q = compact(trimmed);
  const name = compact(fields.name);
  const address = compact(fields.address ?? '');
  const tags = (fields.tags ?? []).map(compact);
  const extra = (fields.extra ?? []).filter(Boolean).map((value) => compact(value!));
  const all = [name, address, ...tags, ...extra].join(' ');
  const words = trimmed.split(/\s+/).filter(Boolean);
  const allWordsMatch = words.every((word) => alternatives(word).some((alt) => all.includes(alt)));
  if (!allWordsMatch && !all.includes(q)) return null;

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 80;
  if (tags.some((tag) => tag === q)) return 70;
  if (tags.some((tag) => tag.includes(q))) return 60;
  if (extra.some((value) => value === q)) return 55;
  if (address.includes(q)) return 45;
  return 35;
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
    ? (lat: number, lng: number) => approxMeters({ latitude: lat, longitude: lng }, near)
    : null;
  // "지금 보는 지역"의 실질 반경 — 시 단위 생활권 20km(강릉이면 주문진·정동진까지).
  // 처음 50km 로 잡았더니 여전히 멀게 느껴진다는 피드백에 좁혔다. 정렬만으로는
  // 전국 매칭이 꼬리로 딸려 와 소용이 없었던 것도 실사용 피드백.
  const SEARCH_RADIUS_M = 20_000;

  let places: { place: Place; score: number }[] = (placesRes.data ?? []).flatMap(
    (row: PlaceRow) => {
      const score = matchScore(query, {
        name: row.name,
        address: row.address,
        tags: row.tags,
        extra: [CATEGORIES[row.category].label],
      });
      return score === null ? [] : [{ place: rowToPlace(row), score }];
    },
  );
  places.sort((a, b) => b.score - a.score);
  if (distTo) {
    places.sort(
      (a, b) =>
        b.score - a.score ||
        distTo(a.place.latitude, a.place.longitude) - distTo(b.place.latitude, b.place.longitude),
    );
    // 반경 안만 남긴다 — 단, 주변에 하나도 없으면 전국 결과를 거리순 그대로 둔다
    // ("부산 카페"처럼 지역을 명시한 검색이 빈손이 되지 않게)
    const within = places.filter(
      (result) => distTo(result.place.latitude, result.place.longitude) <= SEARCH_RADIUS_M,
    );
    if (within.length > 0) places = within;
  }
  const matchedPlaces = places.map((result) => result.place);

  let courses = (coursesRes.data ?? [])
    .map((row: any) => ({
      row,
      score: matchScore(query, {
        name: row.name,
        tags: row.tags,
        extra: [row.description, row.section_from, row.section_to, row.route_name],
      }),
    }))
    .filter((result: { row: any; score: number | null }): result is { row: any; score: number } =>
      result.score !== null,
    )
    .sort((a, b) => b.score - a.score)
    .map(({ row }) => row)
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

  return { places: matchedPlaces, courses };
}
