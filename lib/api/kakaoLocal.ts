import { approxMeters } from '@/lib/distance';
import { ProviderError, providerHttpError, rememberProviderFailure, requireProviderAvailable } from '@/lib/providerErrors';

// 카카오 로컬 REST API 키 (developers.kakao.com > 내 앱 > 앱 키 > REST API 키).
// 네이티브 앱 키(KAKAO_NATIVE_APP_KEY)와는 다른 키다.
const REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

import { normalizeSido } from '@/lib/region';

export interface KakaoLocalResult {
  /** 카카오 로컬에서 장소를 안정적으로 식별하는 ID */
  providerId?: string;
  placeUrl?: string;
  /** 즐겨찾기 등 앱 내부에서 이미 연결한 일반 장소 ID */
  generalPlaceId?: string;
  placeName: string; // 상호 (예: "카페 모토라드")
  address: string; // 지번 주소
  roadAddress: string; // 도로명 주소
  latitude: number;
  longitude: number;
  phone: string; // 전화번호 (없으면 빈 문자열)
}

export interface KakaoLocalSearchPage {
  results: KakaoLocalResult[];
  totalCount: number;
  pageableCount: number;
  isEnd: boolean;
}

const normalizePlaceName = (name: string) =>
  name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');

/**
 * 네이버 지도 심벌에는 외부 장소 ID가 없으므로 카카오 검색 결과로 보완한다.
 * 복합시설의 첫 검색 결과를 무작정 고르지 않고, 같은 이름을 우선한 뒤 정말
 * 가까운 후보가 하나뿐일 때만 좌표 폴백을 허용한다.
 */
export function findKakaoLocalMatch(
  name: string,
  center: { latitude: number; longitude: number },
  results: KakaoLocalResult[],
): KakaoLocalResult | undefined {
  const nearby = results
    .map((result) => ({ result, distance: approxMeters(center, result) }))
    .filter(({ distance }) => distance < 150);
  const normalizedName = normalizePlaceName(name);
  const exactName = nearby
    .filter(({ result }) => normalizePlaceName(result.placeName) === normalizedName)
    .sort((a, b) => a.distance - b.distance);
  if (exactName[0]) return exactName[0].result;

  const veryClose = nearby.filter(({ distance }) => distance < 20);
  return veryClose.length === 1 ? veryClose[0].result : undefined;
}

type KakaoSearchOptions = { throwOnError?: boolean; signal?: AbortSignal };

// 카카오 로컬 키워드 검색 — 상호·주소로 장소를 찾아 좌표까지 반환한다.
// 네이버 지오코딩(정확한 주소만)과 달리 상호로도 검색되어 제보 UX에 적합.
export async function searchKakaoLocal(
  query: string,
  /** 있으면 이 좌표 주변을 우선한다 — 카카오는 x,y 를 주면 정확도 정렬에 거리를
      반영한다(radius 는 안 준다: 하드 필터가 아니라 우선순위만 올리는 게 목적) */
  near?: { latitude: number; longitude: number },
  /** 전체 결과의 0건 여부를 판단하는 화면은 실패를 빈 배열로 오인하면 안 된다. */
  options: KakaoSearchOptions = {},
): Promise<KakaoLocalResult[]> {
  return (await searchKakaoLocalPage(query, near, options)).results;
}

// 결과 지도는 이름이 전국에서 유일한지 확인해야 하므로 첫 페이지의 완결성 메타도 쓴다.
// 일반 호출부는 위 배열 전용 함수를 계속 사용해 기존 계약을 유지한다.
export async function searchKakaoLocalPage(
  query: string,
  near?: { latitude: number; longitude: number },
  options: KakaoSearchOptions = {},
): Promise<KakaoLocalSearchPage> {
  const q = query.trim();
  if (!q) return { results: [], totalCount: 0, pageableCount: 0, isEnd: true };
  const bias = near ? `&x=${near.longitude}&y=${near.latitude}` : '';
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15${bias}`;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
  try {
    if (options.signal?.aborted) throw new ProviderError('kakao-local', 'search', 'cancelled');
    requireProviderAvailable('kakao-local');
    if (!REST_KEY) throw new ProviderError('kakao-local', 'search', 'configuration');
    if (near && (!Number.isFinite(near.latitude) || !Number.isFinite(near.longitude) ||
      Math.abs(near.latitude) > 90 || Math.abs(near.longitude) > 180)) {
      throw new ProviderError('kakao-local', 'search', 'invalid_request');
    }
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
      signal: controller.signal,
    });
    if (!res.ok) throw providerHttpError('kakao-local', 'search', res.status);
    let data;
    try { data = await res.json(); }
    catch { throw new ProviderError('kakao-local', 'search', 'invalid_response'); }
    const documents = data?.documents;
    const meta = data?.meta;
    if (!Array.isArray(documents) || !meta || typeof meta.is_end !== 'boolean' ||
      !Number.isInteger(meta.total_count) || meta.total_count < 0 ||
      !Number.isInteger(meta.pageable_count) || meta.pageable_count < 0 ||
      documents.some((d: any) => !d || typeof d.place_name !== 'string' || !d.place_name.trim() ||
        (typeof d.x !== 'string' && typeof d.x !== 'number') ||
        (typeof d.y !== 'string' && typeof d.y !== 'number') ||
        !Number.isFinite(Number(d.x)) || !Number.isFinite(Number(d.y)) ||
        (typeof d.x === 'string' && !d.x.trim()) || (typeof d.y === 'string' && !d.y.trim()) ||
        Math.abs(Number(d.x)) > 180 || Math.abs(Number(d.y)) > 90 ||
        (d.address_name != null && typeof d.address_name !== 'string') ||
        (d.road_address_name != null && typeof d.road_address_name !== 'string'))) {
      throw new ProviderError('kakao-local', 'search', 'invalid_response');
    }
    if (options.signal?.aborted) throw new ProviderError('kakao-local', 'search', 'cancelled');
    if (timedOut) throw new ProviderError('kakao-local', 'search', 'timeout');
    return {
      results: documents.map((d: any) => ({
        providerId: d.id || undefined,
        placeUrl: d.place_url || undefined,
        placeName: d.place_name ?? '',
        address: normalizeSido(d.address_name),
        roadAddress: normalizeSido(d.road_address_name),
        latitude: Number(d.y),
        longitude: Number(d.x),
        phone: d.phone ?? '',
      })),
      totalCount: meta.total_count,
      pageableCount: meta.pageable_count,
      isEnd: meta.is_end,
    };
  } catch (error) {
    // React Query가 취소한 검색을 정상적인 0건으로 캐시하지 않는다.
    if (options.signal?.aborted) throw new ProviderError('kakao-local', 'search', 'cancelled');
    const normalized = timedOut ? new ProviderError('kakao-local', 'search', 'timeout')
      : error instanceof ProviderError ? error : new ProviderError('kakao-local', 'search', 'offline');
    rememberProviderFailure(normalized);
    if (options.throwOnError !== false) throw normalized;
    return { results: [], totalCount: 0, pageableCount: 0, isEnd: false };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

// 역지오코딩 — 좌표를 실제 주소(도로명 우선, 없으면 지번)로 바꾼다.
// 코스 내비 경유지 이름 등 표시에 쓰이므로 실패는 조용히 null (호출부가 라벨 fallback).
export async function coordToAddress(latitude: number, longitude: number): Promise<string | null> {
  if (!REST_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return null;
    const doc = (await res.json()).documents?.[0];
    const address = doc?.road_address?.address_name ?? doc?.address?.address_name;
    return address ? normalizeSido(address) : null;
  } catch {
    return null;
  }
}


// coord2regioncode 공통 — 행정동(H) 문서를 우선해 하나 고른다.
// 아래 두 함수가 같은 요청에서 다른 필드만 뽑는다.
async function fetchRegionDoc(latitude: number, longitude: number): Promise<any | null> {
  if (!REST_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${longitude}&y=${latitude}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return null;
    const docs = (await res.json()).documents ?? [];
    return docs.find((d: any) => d.region_type === 'H') ?? docs[0] ?? null;
  } catch {
    return null;
  }
}

// 좌표의 시/도·시군구 — 기상특보 지역 매칭용 ("경기도" + "수원시" 형태).
// 표시용 coordToRegion 과 달리 특보 통보문의 지역 표기와 대조할 두 단계가 필요하다.
export async function coordToRegionParts(
  latitude: number,
  longitude: number,
): Promise<{ sido: string; sigungu: string } | null> {
  const doc = await fetchRegionDoc(latitude, longitude);
  if (!doc?.region_1depth_name) return null;
  return { sido: doc.region_1depth_name, sigungu: doc.region_2depth_name ?? '' };
}

// 좌표의 행정동 이름 — "중구 명동" 형태 (날씨 기준 위치 표기용)
export async function coordToRegion(latitude: number, longitude: number): Promise<string | null> {
  const doc = await fetchRegionDoc(latitude, longitude);
  if (!doc) return null;
  return [doc.region_2depth_name, doc.region_3depth_name].filter(Boolean).join(' ') || null;
}
