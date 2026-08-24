import { supabase } from '@/lib/supabase';
import { approxMeters } from '@/lib/distance';

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

// 상세의 TRADE_DT/TM("20260714 175951") → "07.14 17:59 기준"
export function formatTradeAt(tradeAt: string): string {
  const m = tradeAt.match(/^\d{4}(\d{2})(\d{2})\s+(\d{2})(\d{2})/);
  return m ? `${m[1]}.${m[2]} ${m[3]}:${m[4]} 기준` : '';
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
  const stations = (data?.stations ?? []) as GasStation[];
  // 이륜차는 고속도로 진입 금지 — 휴게소 주유소는 애초에 갈 수 없는 곳이라 뺀다.
  // ex알뜰(RTX)은 도로공사 고속도로 휴게소 전용 브랜드, 그 외 브랜드 휴게소는 상호로 거른다.
  return stations.filter((s) => s.brand !== 'ex알뜰' && !s.name.includes('휴게소'));
}

export async function fetchGasStationDetail(id: string): Promise<GasStationDetail> {
  const { data, error } = await supabase.functions.invoke('gas-stations', {
    body: { id },
  });
  if (error) throw new Error(`주유소 상세를 불러오지 못했습니다: ${error.message}`);
  return data as GasStationDetail;
}

// 지도 POI·즐겨찾기의 이름이 주유소로 보이는지. 오피넷은 좌표 반경으로만 찾을 수
// 있어서, 이름으로 먼저 거르지 않으면 아무 장소나 열 때마다 반경 조회가 나간다.
// 네이버 POI는 오피넷의 `SK에너지` 대신 소비자 브랜드인 `SK 엔크린`을
// 상호에 쓰기도 한다. 어느 표기로 들어와도 유가 조회를 시작한다.
const GAS_NAME = /주유소|엔크린|SK\s*에너지|오일뱅크|칼텍스|S-?OIL|알뜰/i;

export function looksLikeGasStation(name: string): boolean {
  // "GS칼텍스 LPG" 처럼 브랜드만 붙은 충전소는 브랜드에 걸려 조회가 나가고,
  // 이륜차와 무관한 곳이라 로딩만 깜빡이다 만다. 다만 "○○주유소 LPG" 는
  // 휘발유도 파는 겸업이라 살린다.
  if (/LPG/i.test(name) && !/주유소/.test(name)) return false;
  return GAS_NAME.test(name);
}

// "HD현대오일뱅크㈜직영 사평로주유소" 와 "현대오일뱅크(주) 사평로주유소" 를 같게 본다
function normalizeName(name: string): string {
  return name
    .replace(/㈜|\(주\)|주식회사|직영|셀프/g, '')
    .replace(/[\s·・.]/g, '')
    .toLowerCase();
}

/**
 * 좌표에 있는 주유소의 유가. 주유소 카테고리를 켜지 않고 POI 를 눌렀거나,
 * 즐겨찾기에서 들어왔을 때도 가격이 보이도록 쓴다.
 *
 * 주유소가 아니거나 못 찾으면 null — 호출부는 그냥 아무것도 안 그리면 된다.
 */
export async function fetchGasPricesAt(place: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<GasStationDetail | null> {
  // 반경은 오피넷 프록시의 하한이 500m 다
  const nearby = await fetchNearbyGasStations({
    latitude: place.latitude,
    longitude: place.longitude,
    radius: 500,
  });
  if (nearby.length === 0) return null;

  const target = normalizeName(place.name);
  const candidates = nearby
    .map((station) => {
      const name = normalizeName(station.name);
      return {
        station,
        meters: approxMeters(station, place),
        sameName: name.includes(target) || target.includes(name),
      };
    })
    .sort((a, b) => a.meters - b.meters);

  // 오피넷 좌표는 KATEC 변환을 거쳐 실제와 수십 m 어긋난다. 상호까지 맞으면
  // 좀 더 멀어도 같은 곳으로 본다.
  const hit = candidates.find((c) => c.meters < 150 || (c.sameName && c.meters < 300));
  return hit ? fetchGasStationDetail(hit.station.id) : null;
}
