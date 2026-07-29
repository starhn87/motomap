import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchRidingWeather } from '@/lib/api/weather';
import { fetchAirQuality } from '@/lib/api/air';

// 라이딩 날씨 — 좌표를 ~1km 격자로 스냅해 캐시를 공유하고 10분간 신선하게 유지
export function useWeather(latitude?: number | null, longitude?: number | null) {
  const lat = latitude != null ? Number(latitude.toFixed(2)) : null;
  const lng = longitude != null ? Number(longitude.toFixed(2)) : null;

  const queryClient = useQueryClient();

  // 미세먼지도 여기서 미리 당겨 둔다 — 에어코리아가 수십 초씩 걸리는 시간대가
  // 있어(실측 10~26초) 시트를 열고 나서 시작하면 한참 비어 보인다. 쿼리키는
  // WeatherSheet 의 것과 동일해야 시트가 캐시를 그대로 쓴다.
  useEffect(() => {
    if (lat === null || lng === null) return;
    void queryClient.prefetchQuery({
      queryKey: ['air-quality', lat.toFixed(2), lng.toFixed(2)],
      queryFn: () => fetchAirQuality(lat, lng),
      staleTime: 30 * 60 * 1000,
    });
  }, [queryClient, lat, lng]);

  return useQuery({
    queryKey: ['weather', lat, lng],
    queryFn: () => fetchRidingWeather(lat!, lng!),
    enabled: lat !== null && lng !== null,
    staleTime: 10 * 60 * 1000,
    // 기상청 초단기예보가 매시간 갱신되므로 지도가 떠 있는 동안 주기적으로 따라간다
    refetchInterval: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
