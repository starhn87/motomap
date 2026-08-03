import { supabase } from '@/lib/supabase';
import type { Hours } from '@/lib/hours';

// 구글 Places 영업시간 프록시(Edge Function place-hours) 클라이언트.
// 우리 DB 에 영업시간이 없는 장소 — 주유소, 지도 POI — 를 메우는 데 쓴다.

export interface PlaceHours {
  hours: Hours | null;
  /** 구글 businessStatus. 임시 휴업·폐업은 영업시간보다 우선한다 */
  businessStatus: string | null;
}

/**
 * sourceKey 는 우리 쪽 식별자다. 이 키로 google place_id 를 영구 보관하기 때문에
 * 같은 장소가 항상 같은 키로 와야 캐시가 듣는다.
 */
export function poiSourceKey(latitude: number, longitude: number): string {
  // 좌표는 소수 5자리(약 1m)로 끊는다 — 부동소수 끝자리가 흔들려도 같은 키가 되도록
  return `poi:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export async function fetchPlaceHours(params: {
  sourceKey: string;
  name: string;
  latitude: number;
  longitude: number;
}): Promise<PlaceHours | null> {
  const { data, error } = await supabase.functions.invoke('place-hours', {
    body: {
      sourceKey: params.sourceKey,
      name: params.name,
      lat: params.latitude,
      lng: params.longitude,
    },
  });
  // 영업시간은 없으면 안 보여주면 그만이다 — 실패를 사용자에게 알리지 않는다
  if (error) return null;
  return data as PlaceHours;
}
