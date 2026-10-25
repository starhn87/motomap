import { gasCacheMetadata, GAS_EMPTY_TTL_MS, type GasCacheMetadata } from '@/lib/gasCache';
import { supabase } from '@/lib/supabase';
import { withCoordinateUse } from '@/stores/useLocationPrivacyStore';
import { approxMeters } from '@/lib/distance';
import { ProviderError, edgeProviderError } from '@/lib/providerErrors';

// 오피넷 유가 프록시(Edge Function gas-stations) 클라이언트.
// 유가는 DB places 와 별개의 실시간 레이어 — 주유소 카테고리 필터가 켜졌을 때만 조회한다.

export type FuelCode = 'B027' | 'B034' | 'D047';

export const FUEL_LABELS: Record<Exclude<FuelCode, 'D047'>, string> = {
  B027: '휘발유',
  B034: '고급휘발유',
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

export interface GasStationDetail extends Partial<GasCacheMetadata> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStation(value: unknown): value is GasStation {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && typeof value.brand === 'string' && typeof value.isSelf === 'boolean'
    && typeof value.price === 'number' && Number.isFinite(value.price) && value.price >= 0
    && typeof value.distance === 'number' && Number.isFinite(value.distance) && value.distance >= 0
    && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

function isStationDetail(value: unknown): value is GasStationDetail {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && ['brand', 'address', 'tel'].every((key) => typeof value[key] === 'string')
    && ['isSelf', 'carWash', 'convenience', 'repair'].every((key) => typeof value[key] === 'boolean')
    && Array.isArray(value.prices) && value.prices.every((price: unknown) =>
      isRecord(price) && typeof price.prod === 'string'
      && typeof price.price === 'number' && Number.isFinite(price.price) && price.price >= 0
      && typeof price.tradeAt === 'string');
}

async function requestGasInfo(body: Record<string, unknown>, operation: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const { data, error } = await supabase.functions.invoke('gas-stations', { body, timeout: 15_000, signal });
    if (error) throw error;
    return data;
  } catch (error) {
    throw edgeProviderError('opinet', operation, error);
  }
}

// 상세의 TRADE_DT/TM("20260714 175951") → "07.14 17:59 기준"
export function formatTradeAt(tradeAt: string): string {
  const m = tradeAt.match(/^\d{4}(\d{2})(\d{2})\s+(\d{2})(\d{2})/);
  return m ? `${m[1]}.${m[2]} ${m[3]}:${m[4]} 기준` : '';
}

export interface GasStationSearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  prod?: FuelCode;
  signal?: AbortSignal;
  preciseCenter?: boolean;
}

export interface GasStationSnapshot extends GasCacheMetadata { stations: GasStation[] }

export async function fetchNearbyGasStations(params: GasStationSearchParams): Promise<GasStation[]> {
  return (await fetchNearbyGasStationsSnapshot(params)).stations;
}

export async function fetchNearbyGasStationsSnapshot(params: GasStationSearchParams): Promise<GasStationSnapshot> {
  const startedAt = Date.now();
  const data = await withCoordinateUse(params,'gas','opinet',() => requestGasInfo({
    lat: params.latitude,
    lng: params.longitude,
    radius: params.radius ?? 5000,
    prod: params.prod ?? 'B027',
    ...(params.preciseCenter ? { preciseCenter: true } : {}),
  }, 'nearby', params.signal));
  if (!isRecord(data) || (params.preciseCenter && data.preciseCenter !== true) || !Array.isArray(data.stations) || !data.stations.every(isStation)) {
    throw new ProviderError('opinet', 'nearby', 'invalid_response');
  }
  const stations = data.stations;
  // 이륜차는 고속도로 진입 금지 — 휴게소 주유소는 애초에 갈 수 없는 곳이라 뺀다.
  // ex알뜰(RTX)은 도로공사 고속도로 휴게소 전용 브랜드, 그 외 브랜드 휴게소는 상호로 거른다.
  const visible = stations.filter((s) => s.brand !== 'ex알뜰' && !s.name.includes('휴게소'));
  return { stations: visible, ...gasCacheMetadata(data, startedAt, visible.some(station => station.price > 0)) };
}

export async function fetchGasStationDetail(id: string): Promise<GasStationDetail> {
  const startedAt = Date.now();
  const data = await requestGasInfo({ id }, 'detail');
  if (!isStationDetail(data)) throw new ProviderError('opinet', 'detail', 'invalid_response');
  return { ...data, ...gasCacheMetadata(data, startedAt, data.prices.some(price => price.price > 0)) };
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
export async function fetchGasPricesAtSnapshot(place: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<GasCacheMetadata & { detail: GasStationDetail | null }> {
  // 반경은 오피넷 프록시의 하한이 500m 다
  const snapshot = await fetchNearbyGasStationsSnapshot({
    latitude: place.latitude,
    longitude: place.longitude,
    radius: 500,
  });
  const nearby = snapshot.stations;
  const empty = () => ({ detail: null, fetchedAt: snapshot.fetchedAt, expiresAt: Math.min(snapshot.expiresAt, snapshot.fetchedAt + GAS_EMPTY_TTL_MS) });
  if (nearby.length === 0) return empty();

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
  if (!hit) return empty();
  const detail = await fetchGasStationDetail(hit.station.id);
  return { detail, fetchedAt: Math.min(snapshot.fetchedAt, detail.fetchedAt ?? snapshot.fetchedAt),
    expiresAt: Math.min(snapshot.expiresAt, detail.expiresAt ?? snapshot.expiresAt) };
}

export async function fetchGasPricesAt(place: { name: string; latitude: number; longitude: number }): Promise<GasStationDetail | null> {
  return (await fetchGasPricesAtSnapshot(place)).detail;
}
