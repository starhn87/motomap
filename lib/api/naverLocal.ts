import { supabase } from '@/lib/supabase';
import type { KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { normalizeSido } from '@/lib/region';
import { findGeneralPlace } from '@/lib/api/generalPlaces';
import { ProviderError, edgeProviderError, rememberProviderFailure, requireProviderAvailable } from '@/lib/providerErrors';

export async function searchNaverLocal(query: string, signal?: AbortSignal): Promise<KakaoLocalResult[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 10_000);
  try {
    if (signal?.aborted) throw new ProviderError('naver-local', 'search', 'cancelled');
    requireProviderAvailable('naver-local');
    const { data, error } = await supabase.functions.invoke('naver-local-search', {
      body: { query }, signal: controller.signal,
    });
    if (signal?.aborted) throw new ProviderError('naver-local', 'search', 'cancelled');
    if (controller.signal.aborted) throw new ProviderError('naver-local', 'search', 'timeout');
    if (error) {
      // 인증 게이트웨이의 401과 공급자 키 오류를 구분한다.
      const context = (error as { context?: Response }).context;
      let kind: unknown;
      try { kind = (await context?.clone().json())?.kind; } catch { /* 원문은 기록하지 않는다. */ }
      if (['configuration', 'temporary', 'timeout', 'rate_limited', 'invalid_request', 'invalid_response'].includes(String(kind))) {
        throw new ProviderError('naver-local', 'search', kind as ProviderError['kind'], context?.status);
      }
      throw edgeProviderError('naver-local', 'search', error);
    }
    if (!data || !Array.isArray(data.results) || data.results.length > 5 || data.results.some((row: any) =>
      !row || row.source !== 'naver' || typeof row.placeName !== 'string' || !row.placeName.trim() ||
      typeof row.address !== 'string' || typeof row.roadAddress !== 'string' || typeof row.phone !== 'string' ||
      !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
      row.latitude < 32 || row.latitude > 39 || row.longitude < 124 || row.longitude > 132)) {
      throw new ProviderError('naver-local', 'search', 'invalid_response');
    }
    const results: KakaoLocalResult[] = data.results.map((row: KakaoLocalResult) => ({
      placeName: row.placeName, address: normalizeSido(row.address), roadAddress: normalizeSido(row.roadAddress),
      latitude: row.latitude, longitude: row.longitude, phone: row.phone, source: 'naver',
      placeUrl: `https://map.naver.com/p/search/${encodeURIComponent(row.placeName)}`,
    }));
    await Promise.all(results.map(async (row) => {
      // 검색은 읽기만 수행한다. 기록 생성·기존 행 수정·리뷰 복제는 하지 않는다.
      try {
        const existing = await findGeneralPlace({ name: row.placeName, address: row.roadAddress || row.address,
          latitude: row.latitude, longitude: row.longitude, placeUrl: row.placeUrl }, controller.signal);
        if (existing) {
          row.generalPlaceId = existing.id;
          row.generalPlaceSource = { provider: existing.provider, providerId: existing.providerId };
          if (existing.provider === 'kakao') row.providerId = existing.providerId;
        }
      } catch { /* 검색 후보는 유지하고, 기록 액션에서는 일반 장소 조회 오류를 별도로 표시한다. */ }
    }));
    if (signal?.aborted) throw new ProviderError('naver-local', 'search', 'cancelled');
    if (controller.signal.aborted) throw new ProviderError('naver-local', 'search', 'timeout');
    return results;
  } catch (error) {
    const normalized = signal?.aborted ? new ProviderError('naver-local', 'search', 'cancelled')
      : controller.signal.aborted ? new ProviderError('naver-local', 'search', 'timeout')
      : error instanceof ProviderError ? error : edgeProviderError('naver-local', 'search', error);
    rememberProviderFailure(normalized);
    throw normalized;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
