import { toast } from '@/lib/toast';

// 카카오 로컬 REST API 키 (developers.kakao.com > 내 앱 > 앱 키 > REST API 키).
// 네이티브 앱 키(KAKAO_NATIVE_APP_KEY)와는 다른 키다.
const REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

export interface KakaoLocalResult {
  placeName: string; // 상호 (예: "카페 모토라드")
  address: string; // 지번 주소
  roadAddress: string; // 도로명 주소
  latitude: number;
  longitude: number;
}

// 카카오 로컬 키워드 검색 — 상호·주소로 장소를 찾아 좌표까지 반환한다.
// 네이버 지오코딩(정확한 주소만)과 달리 상호로도 검색되어 제보 UX에 적합.
export async function searchKakaoLocal(query: string): Promise<KakaoLocalResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!REST_KEY) {
    toast.error('주소 검색을 사용할 수 없습니다.', 'KAKAO REST API 키가 설정되지 않았습니다.');
    return [];
  }

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents ?? []).map((d: any) => ({
      placeName: d.place_name ?? '',
      address: d.address_name ?? '',
      roadAddress: d.road_address_name ?? '',
      latitude: Number(d.y),
      longitude: Number(d.x),
    }));
  } catch {
    return [];
  }
}

// 역지오코딩 — 좌표를 실제 주소(도로명 우선, 없으면 지번)로 바꾼다.
// 코스 내비 경유지 이름 등 표시에 쓰이므로 실패는 조용히 null (호출부가 라벨 fallback).
export async function coordToAddress(latitude: number, longitude: number): Promise<string | null> {
  if (!REST_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return null;
    const doc = (await res.json()).documents?.[0];
    return doc?.road_address?.address_name ?? doc?.address?.address_name ?? null;
  } catch {
    return null;
  }
}

// 지도 탭 지점 정보 — 주소와 건물명(있으면)을 함께 반환한다.
// 지도에 그려진 건물 심볼을 탭했을 때 그 이름을 카드 제목으로 쓰기 위한 용도.
export async function coordToSpot(
  latitude: number,
  longitude: number,
): Promise<{ address: string; buildingName: string | null } | null> {
  if (!REST_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return null;
    const doc = (await res.json()).documents?.[0];
    const address = doc?.road_address?.address_name ?? doc?.address?.address_name;
    if (!address) return null;
    const buildingName = doc?.road_address?.building_name || null;
    return { address, buildingName };
  } catch {
    return null;
  }
}

// 지도에 심볼로 그려지는 대표 POI 카테고리들 — 탭 지점 근처의 "알려진 장소"를 찾는 용도
// (음식점·카페·편의점·주유소·관광명소·문화시설·마트·지하철역·숙박·병원·은행·약국·학교·공공기관·주차장)
const POI_CATEGORIES = [
  'FD6', 'CE7', 'CS2', 'OL7', 'AT4', 'CT1', 'MT1', 'SW8',
  'AD5', 'HP8', 'BK9', 'PM9', 'SC4', 'PO3', 'PK6',
];

// 탭 지점 반경 내 최근접 POI — 지도 기본 심볼 탭을 근사한다.
// 라이브러리가 심볼 탭 이벤트를 안 주므로, 좌표 기준 카테고리 검색으로 대신한다.
export async function nearestPoi(
  latitude: number,
  longitude: number,
  radius = 40,
): Promise<KakaoLocalResult | null> {
  if (!REST_KEY) return null;
  const base =
    `https://dapi.kakao.com/v2/local/search/category.json` +
    `?x=${longitude}&y=${latitude}&radius=${radius}&sort=distance&size=1`;
  const docs = await Promise.all(
    POI_CATEGORIES.map(async (code) => {
      try {
        const res = await fetch(`${base}&category_group_code=${code}`, {
          headers: { Authorization: `KakaoAK ${REST_KEY}` },
        });
        if (!res.ok) return null;
        return (await res.json()).documents?.[0] ?? null;
      } catch {
        return null;
      }
    }),
  );
  const best = docs
    .filter((d): d is any => d != null)
    .sort((a, b) => Number(a.distance) - Number(b.distance))[0];
  if (!best) return null;
  return {
    placeName: best.place_name ?? '',
    address: best.address_name ?? '',
    roadAddress: best.road_address_name ?? '',
    latitude: Number(best.y),
    longitude: Number(best.x),
  };
}

// 좌표의 행정동 이름 — "중구 명동" 형태 (날씨 기준 위치 표기용)
export async function coordToRegion(latitude: number, longitude: number): Promise<string | null> {
  if (!REST_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${longitude}&y=${latitude}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) return null;
    const docs = (await res.json()).documents ?? [];
    const doc = docs.find((d: any) => d.region_type === 'H') ?? docs[0];
    if (!doc) return null;
    return [doc.region_2depth_name, doc.region_3depth_name].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}
