import { supabase } from '@/lib/supabase';

// 오피넷 유가 프록시(Edge Function gas-stations) 클라이언트.
// 유가는 DB places 와 별개의 실시간 레이어 — 주유소 카테고리 필터가 켜졌을 때만 조회한다.

export type FuelCode = 'B027' | 'B034' | 'D047';

export const FUEL_LABELS: Record<FuelCode, string> = {
  B027: '휘발유',
  B034: '고급휘발유',
  D047: '경유',
};

// 마커 브랜드 칩 — 멤버십·할인 때문에 어느 브랜드인지가 중요하다 (EF가 주는 한글 브랜드명 기준)
export const BRAND_BADGES: Record<string, { label: string; color: string; textColor?: string }> = {
  SK에너지: { label: 'SK', color: '#E60012' },
  GS칼텍스: { label: 'GS', color: '#F58220' },
  HD현대오일뱅크: { label: 'HD', color: '#1E5AA8' },
  'S-OIL': { label: 'S-OIL', color: '#FDB913', textColor: '#1F2937' },
  자영알뜰: { label: '알뜰', color: '#0BAF9F' },
  ex알뜰: { label: '알뜰', color: '#0BAF9F' },
  NH알뜰: { label: '알뜰', color: '#0BAF9F' },
  자가상표: { label: '무폴', color: '#6B7280' },
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
