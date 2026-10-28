// 주변 응답에는 업종 코드가 없어 의미가 같은 업종끼리 조회하고 표시용 분류를 붙인다.
// 추천 장소의 category/DB 식별자와는 별개다. 이름으로 업종을 추측하지 않는다.
export const TMAP_POI_GROUPS = [
  { industry: 'cafe', categories: ['커피', '카페'] },
  { industry: 'food', categories: ['한식', '중식', '일식', '패밀리레스토랑', '전문음식점', '피자', '치킨', '패스트푸드'] },
  { industry: 'bakery', categories: ['디저트', '제과점', '베스킨라빈스', '하겐다즈', '나뚜루', '콜드스톤'] },
  { industry: 'shop', categories: ['편의점', '대형마트', '마트'] },
  { industry: 'lodging', categories: ['숙박', '호텔'] },
  { industry: 'bank', categories: ['은행', 'ATM'] },
  { industry: 'civic', categories: ['관공서'] },
  { industry: 'beauty', categories: ['목욕탕', '미용실', '이발소'] },
  { industry: 'toilet', categories: ['화장실'] },
  { industry: 'park', categories: ['공원'] },
  { industry: 'transit', categories: ['버스', '버스정류장', '지하철'] },
  { industry: 'fuel', categories: ['주유소', '충전소', 'EV충전소', 'EV/가스충전소'] },
  { industry: 'parking', categories: ['주차장'] },
  { industry: 'repair', categories: ['정비소'] },
  { industry: 'pharmacy', categories: ['약국'] },
  { industry: 'medical', categories: ['병원', '내과', '소아과', '외과', '치과', '안과', '의원', '보건소', '한의원'] },
  { industry: 'culture', categories: ['영화관', '노래방', 'PC방', '공연장', '문화시설', '스크린골프장'] },
  { industry: 'general', categories: ['음식', '식음료', 'TV맛집', '쇼핑', '교통', '놀거리', '레저', '주요시설물', 'T와이파이존'] },
] as const;
export type TmapIndustry = typeof TMAP_POI_GROUPS[number]['industry'];
export const TMAP_INDUSTRIES: readonly string[] = TMAP_POI_GROUPS.map(g => g.industry);
export const TMAP_SERVER_TTL = 23 * 60 * 60 * 1000;
export const TMAP_DEVICE_TTL = 30 * 60 * 1000;
export interface TmapPoi {
  id: string; name: string; address: string; latitude: number; longitude: number; industry: TmapIndustry;
}
// 같은 약2km 격자의 사용자는 공용 결과를 재사용한다. 실제 GPS·사용자 ID를 캐시 키로 쓰지 않는다.
export function tmapCell(point: { latitude: number; longitude: number }) {
  return { lat: Math.floor(point.latitude * 50), lon: Math.floor(point.longitude * 50) };
}
export function validTmapCell(cell: { lat: number; lon: number }) {
  return Number.isInteger(cell.lat) && Number.isInteger(cell.lon) && cell.lat >= 1600 && cell.lat < 1950 && cell.lon >= 6200 && cell.lon < 6600;
}
function text(value: unknown, max = 200): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new Error('invalid_response');
  return value.trim();
}
export function parseTmapPois(body: unknown, industry: TmapIndustry): TmapPoi[] {
  const data = body as { searchPoiInfo?: { totalCount?: unknown; pois?: { poi?: unknown } } } | null;
  const info = data?.searchPoiInfo;
  // TMAP의 정상 0건은 pois가 생략될 수 있다. 오류 봉투를 빈 결과로 바꾸지 않는다.
  if (!info || !/^\d+$/.test(String(info.totalCount))) throw new Error('invalid_response');
  if (Number(info.totalCount) === 0 && !info.pois?.poi) return [];
  const rows = info.pois?.poi;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('invalid_response');
  return rows.map(row => {
    const id = text(row?.id, 100), name = text(row?.name);
    // front는 실제 입구일 수 있다. 표시 위치는 POI 자체 좌표(noor)를 우선한다.
    const lat = row?.noorLat || row?.frontLat, lon = row?.noorLon || row?.frontLon;
    if (!id || !name || typeof lat !== 'string' || !lat.trim() || typeof lon !== 'string' || !lon.trim()) throw new Error('invalid_response');
    const latitude = Number(lat), longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 32 || latitude > 39 || longitude < 124 || longitude > 132) throw new Error('invalid_response');
    const address = [row.upperAddrName, row.middleAddrName, row.lowerAddrName, row.detailAddrName].map(v => text(v)).filter(Boolean).join(' ');
    return { id, name, address, latitude, longitude, industry };
  });
}
