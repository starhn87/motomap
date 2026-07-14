import { supabase } from '@/lib/supabase';

// 오피넷 유가 프록시(Edge Function gas-stations) 클라이언트.
// 유가는 DB places 와 별개의 실시간 레이어 — 주유소 카테고리 필터가 켜졌을 때만 조회한다.

export type FuelCode = 'B027' | 'B034' | 'D047';

export const FUEL_LABELS: Record<FuelCode, string> = {
  B027: '휘발유',
  B034: '고급휘발유',
  D047: '경유',
};

export interface GasStation {
  id: string;
  name: string;
  brand: string;
  price: number;
  distance: number;
  latitude: number;
  longitude: number;
  isSelf: boolean;
}

export interface GasStationDetail {
  id: string;
  name: string;
  brand: string;
  address: string;
  tel: string;
  isSelf: boolean;
  carWash: boolean;
  convenience: boolean;
  repair: boolean;
  prices: { prod: string; price: number; tradeAt: string }[];
}

export async function fetchNearbyGasStations(params: {
  latitude: number;
  longitude: number;
  radius?: number;
  prod?: FuelCode;
}): Promise<GasStation[]> {
  const { data, error } = await supabase.functions.invoke('gas-stations', {
    body: {
      lat: params.latitude,
      lng: params.longitude,
      radius: params.radius ?? 5000,
      prod: params.prod ?? 'B027',
    },
  });
  if (error) throw new Error(`주유소 정보를 불러오지 못했습니다: ${error.message}`);
  return (data?.stations ?? []) as GasStation[];
}

export async function fetchGasStationDetail(id: string): Promise<GasStationDetail> {
  const { data, error } = await supabase.functions.invoke('gas-stations', {
    body: { id },
  });
  if (error) throw new Error(`주유소 상세를 불러오지 못했습니다: ${error.message}`);
  return data as GasStationDetail;
}
