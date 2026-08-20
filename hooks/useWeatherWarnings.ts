import { useQuery } from '@tanstack/react-query';

import { coordToRegionParts } from '@/lib/api/kakaoLocal';
import {
  fetchWeatherWarnings,
  warningsForRegion,
  type WeatherWarning,
} from '@/lib/api/weather';

/**
 * 이 좌표에 발효 중인 기상특보 — 전국 특보(10분 캐시)를 지역 매칭까지 끝내
 * 경보 우선으로 돌려준다. 폭염·호우·강풍은 라이딩 가부에 직결되는데 단기예보에는
 * 안 실린다. 조회 실패는 빈 배열(fail-open) — 특보 없이도 화면은 떠야 한다.
 */
export function useWeatherWarnings(
  latitude: number | undefined,
  longitude: number | undefined,
  enabled = true,
): WeatherWarning[] {
  const { data: allWarnings = [] } = useQuery({
    queryKey: ['weather-warnings'],
    queryFn: fetchWeatherWarnings,
    enabled,
    staleTime: 10 * 60 * 1000,
  });
  const { data: regionParts } = useQuery({
    queryKey: ['weather-region-parts', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () => coordToRegionParts(latitude!, longitude!),
    enabled: enabled && latitude != null && longitude != null,
    staleTime: 30 * 60 * 1000,
  });
  return (
    warningsForRegion(allWarnings, regionParts ?? null)
      // 경보를 앞으로 — 자리가 좁아 대표 하나만 보여줄 때 심한 것이 먼저다
      .sort((a, b) => Number(b.level === '경보') - Number(a.level === '경보'))
  );
}
