import { supabase } from '@/lib/supabase';

// 미세먼지(에어코리아) — 좌표를 카카오 transcoord 로 TM 좌표로 바꾼 뒤
// air-kr Edge Function(최근접 측정소 실시간 측정값)을 호출한다.

const REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

export interface AirQuality {
  station: string;
  pm10: number | null;
  pm25: number | null;
  /** 1 좋음, 2 보통, 3 나쁨, 4 매우나쁨 (결측 null) */
  pm10Grade: number | null;
  pm25Grade: number | null;
  dataTime: string | null;
}

export const AIR_GRADE_LABEL: Record<number, string> = {
  1: '좋음',
  2: '보통',
  3: '나쁨',
  4: '매우나쁨',
};

export const AIR_GRADE_COLOR: Record<number, string> = {
  1: '#3B82F6',
  2: '#22C55E',
  3: '#F97316',
  4: '#EF4444',
};

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
): Promise<AirQuality | null> {
  if (!REST_KEY) return null;
  try {
    // WGS84 → TM (에어코리아 측정소 좌표계)
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/transcoord.json?x=${longitude}&y=${latitude}&input_coord=WGS84&output_coord=TM`,
      { headers: { Authorization: `KakaoAK ${REST_KEY}` } },
    );
    if (!res.ok) return null;
    const doc = (await res.json()).documents?.[0];
    if (!doc) return null;

    const { data, error } = await supabase.functions.invoke('air-kr', {
      body: { tmX: doc.x, tmY: doc.y },
    });
    if (error || !data?.station) return null;
    return data as AirQuality;
  } catch {
    return null;
  }
}
