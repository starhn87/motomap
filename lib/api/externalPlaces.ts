import { searchKakaoLocalPage, type KakaoLocalSearchPage } from '@/lib/api/kakaoLocal';
import { searchNaverLocal } from '@/lib/api/naverLocal';
import { ProviderError } from '@/lib/providerErrors';
import { isSuppressedExternalPlace } from '@/lib/placeCatalogSuppression';
import { isSameExternalPlace } from '@/lib/searchMatching';
import type { KakaoLocalResult } from '@/lib/api/kakaoLocal';

const compactName = (name: string) => name.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const startsWithQuery = (row: KakaoLocalResult, query: string) => compactName(row.placeName).startsWith(compactName(query));

/** 카카오 결과에 검색어로 시작하는 이름이 없을 때만 네이버로 보완한다(SEARCH-023).
 *  카카오가 모르는 장소는 부분 입력에 다른 상호만 돌려줘 0건 보완(SEARCH-012)이 걸리지 않는다.
 *  보완은 덤이라 네이버 실패·호출 제한은 조용히 넘기고 카카오 결과만 보인다. */
async function withNaverSupplement(query: string, kakao: KakaoLocalResult[], signal?: AbortSignal) {
  if (kakao.some((row) => startsWithQuery(row, query))) return kakao;
  const naver = await searchNaverLocal(query, signal).catch((error) => {
    if (signal?.aborted) throw error;
    return [];
  });
  const extra = naver.filter((row) => !isSuppressedExternalPlace(row) && !kakao.some((known) =>
    isSameExternalPlace({ name: known.placeName, latitude: known.latitude, longitude: known.longitude }, row)));
  // 검색어로 시작하는 네이버 결과가 사용자가 찾던 곳일 가능성이 높아 앞에 둔다.
  const prefixed = extra.filter((row) => startsWithQuery(row, query));
  return [...prefixed, ...kakao, ...extra.filter((row) => !prefixed.includes(row))];
}

/** 기존 페이지 계약을 유지하되 네이버의 최대 5건을 전국의 완결 결과로 오인하지 않는다. */
export async function searchExternalPlacesPage(
  query: string,
  near?: { latitude: number; longitude: number },
  options: { signal?: AbortSignal; throwOnError?: boolean } = {},
): Promise<KakaoLocalSearchPage> {
  if (!query.trim()) return { results: [], totalCount: 0, pageableCount: 0, isEnd: true };
  let kakaoFailure: unknown;
  try {
    const page = await searchKakaoLocalPage(query, near, { ...options, throwOnError: true });
    if (page.results.length) {
      const kakao = page.results.filter((row) => !isSuppressedExternalPlace(row));
      return { ...page, results: await withNaverSupplement(query, kakao, options.signal) };
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof ProviderError && error.kind === 'cancelled')) throw error;
    kakaoFailure = error;
  }
  try {
    const results = await searchNaverLocal(query, options.signal);
    if (!results.length && kakaoFailure) throw kakaoFailure;
    return { results: results.filter((row) => !isSuppressedExternalPlace(row)), totalCount: results.length, pageableCount: results.length, isEnd: false,
      failedSources: kakaoFailure ? ['kakao'] : [] };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const failedSources: ('kakao' | 'naver')[] = kakaoFailure
      ? error === kakaoFailure ? ['kakao'] : ['kakao', 'naver'] : ['naver'];
    if (options.throwOnError !== false) {
      // 설정 오류 캐시에 저장된 동일 객체를 다른 검색의 실패 메타로 덮어쓰지 않는다.
      const failure = error instanceof ProviderError
        ? new ProviderError(error.provider, error.operation, error.kind, error.status)
        : new ProviderError('search', 'query', 'temporary');
      throw Object.assign(failure, { failedSources });
    }
    return { results: [], totalCount: 0, pageableCount: 0, isEnd: false, failedSources };
  }
}

export async function searchExternalPlaces(
  query: string, near?: { latitude: number; longitude: number },
  options: { signal?: AbortSignal; throwOnError?: boolean } = {},
) { return (await searchExternalPlacesPage(query, near, options)).results; }

export function externalPlaceAttribution(results: { source?: string; placeUrl?: string }[]): string {
  const sources = new Set(results.map((row) => externalPlaceSource(row) === 'naver' ? '네이버' : '카카오'));
  return `장소 정보 제공: ${[...sources].join(' · ')}`;
}

export function externalPlaceSource(row: { source?: string; placeUrl?: string }): 'naver' | 'kakao' {
  return row.source === 'naver' || row.placeUrl?.startsWith('https://map.naver.com/') ? 'naver' : 'kakao';
}

export function externalPlaceCounts(results: { source?: string; placeUrl?: string }[]) {
  const naver = results.filter((row) => externalPlaceSource(row) === 'naver').length;
  return { kakao_count: results.length - naver, naver_count: naver, external_count: results.length };
}
