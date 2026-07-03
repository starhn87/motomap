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
