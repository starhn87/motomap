import { supabase } from '@/lib/supabase';
import { approxMeters } from '@/lib/distance';
import type { Place, RidingGuideSearchResult } from '@/types';
import { rowToPlace, type PlaceRow } from '@/lib/api/places';
import {
  searchKakaoLocal,
  type KakaoLocalResult,
} from '@/lib/api/kakaoLocal';

export interface SearchResults {
  places: Place[];
  ridingGuides: RidingGuideSearchResult[];
}

export interface UnifiedPlaceSearchResults extends SearchResults {
  kakaoOnly: KakaoLocalResult[];
}

export const SEARCH_RADIUS_M = 20_000;

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
  바이크샵: ['바이크샵', '바이크사', '오토바이샵', '정비'],
  오토바이샵: ['오토바이샵', '바이크샵', '바이크사', '정비'],
  오토바이센터: ['오토바이센터', '바이크사', '정비'],
  정비소: ['정비소', '바이크사', '정비'],
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

function searchTermGroups(query: string): string[][] {
  return query.split(/\s+/).filter(Boolean).map(alternatives);
}

export async function searchAll(
  query: string,
  /** 있으면 이 좌표(보통 지금 보는 지도 중심)의 반경 안 결과만 반환한다.
      반경 안에 하나도 없을 때만 전국 결과로 폴백한다. */
  near?: { latitude: number; longitude: number },
  /** true면 반경 밖 결과로 폴백하지 않는다 — 결과 지도의 '이 지역' 범위용 */
  nearOnly = false,
  signal?: AbortSignal,
): Promise<SearchResults> {
  const trimmed = query.trim();
  // 최근 검색의 일반 장소를 등록 장소로 승격하는 1회성 전체 장소 조회 경로. 실제
  // 검색은 2자 이상에서만 실행되므로 아래 RPC의 결과 상한과 분리한다.
  if (!trimmed && !nearOnly) {
    const request = supabase.rpc('all_places', { category_filter: undefined });
    const placesRes = await (signal ? request.abortSignal(signal) : request);
    if (placesRes.error) throw placesRes.error;
    return {
      places: (placesRes.data ?? []).map((row: PlaceRow) => rowToPlace(row)),
      ridingGuides: [],
    };
  }

  const sharedParams = {
    p_query: trimmed,
    p_term_groups: searchTermGroups(trimmed),
    p_lat: near?.latitude,
    p_lng: near?.longitude,
    p_radius_meters: SEARCH_RADIUS_M,
    p_near_only: nearOnly,
  };
  const placesRequest = supabase.rpc('search_places_v2', { ...sharedParams, p_limit: 50 });
  const ridingGuidesRequest = supabase.rpc('search_riding_guides_v1', {
    ...sharedParams,
    p_limit: 30,
  });
  const [placesRes, ridingGuidesRes] = await Promise.all([
    signal ? placesRequest.abortSignal(signal) : placesRequest,
    signal ? ridingGuidesRequest.abortSignal(signal) : ridingGuidesRequest,
  ]);
  if (placesRes.error) throw placesRes.error;
  if (ridingGuidesRes.error) throw ridingGuidesRes.error;
  return {
    places: (placesRes.data ?? []).map((row: PlaceRow) => rowToPlace(row)),
    ridingGuides: (ridingGuidesRes.data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      featuredRoads: row.featured_roads ?? [],
      regions: row.regions ?? [],
      tags: row.tags ?? [],
      coverImageUrl: row.cover_image_url ?? undefined,
      publishedAt: row.published_at,
      primaryLatitude: row.primary_latitude,
      primaryLongitude: row.primary_longitude,
    })),
  };
}

/** 등록 장소·라이딩 추천·카카오 일반 장소를 같은 검색 요청 생명주기로 묶는다. */
export async function searchUnifiedPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
  options: { signal?: AbortSignal; nearOnly?: boolean } = {},
): Promise<UnifiedPlaceSearchResults> {
  const [registered, kakao] = await Promise.all([
    searchAll(query, near, options.nearOnly, options.signal),
    searchKakaoLocal(query, near, { signal: options.signal }),
  ]);
  const kakaoOnly = kakao.filter(
    (result) =>
      !registered.places.some((place) =>
        isSamePlace(place, {
          name: result.placeName,
          latitude: result.latitude,
          longitude: result.longitude,
        }),
      ),
  );
  return { ...registered, kakaoOnly };
}
