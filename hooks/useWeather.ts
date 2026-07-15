import { useQuery } from '@tanstack/react-query';

import { fetchRidingWeather } from '@/lib/api/weather';

// 라이딩 날씨 — 좌표를 ~1km 격자로 스냅해 캐시를 공유하고 10분간 신선하게 유지
export function useWeather(latitude?: number | null, longitude?: number | null) {
  const lat = latitude != null ? Number(latitude.toFixed(2)) : null;
  const lng = longitude != null ? Number(longitude.toFixed(2)) : null;

  return useQuery({
    queryKey: ['weather', lat, lng],
    queryFn: () => fetchRidingWeather(lat!, lng!),
    enabled: lat !== null && lng !== null,
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
