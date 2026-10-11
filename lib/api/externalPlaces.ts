import { searchKakaoLocalPage, type KakaoLocalSearchPage } from '@/lib/api/kakaoLocal';
import { searchNaverLocal } from '@/lib/api/naverLocal';
import { ProviderError } from '@/lib/providerErrors';

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
    if (page.results.length) return page;
  } catch (error) {
    if (options.signal?.aborted || (error instanceof ProviderError && error.kind === 'cancelled')) throw error;
    kakaoFailure = error;
  }
  try {
    const results = await searchNaverLocal(query, options.signal);
    if (!results.length && kakaoFailure) throw kakaoFailure;
    return { results, totalCount: results.length, pageableCount: results.length, isEnd: false,
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
