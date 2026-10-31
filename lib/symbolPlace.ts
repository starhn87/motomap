import type { TempPlace } from '@/components/map/TempPlaceSheet';
import { searchExternalPlaces } from '@/lib/api/externalPlaces';
import { findGeneralPlace } from '@/lib/api/generalPlaces';
import { findKakaoLocalMatch } from '@/lib/api/kakaoLocal';

// 네이버 지도 심벌 이벤트에는 외부 장소 ID·전화번호가 없다 — 이름으로 검색해 같은 자리
// 결과를 찾아 리뷰·즐겨찾기가 이후에도 같은 장소를 바라보게 한다. 못 찾으면 null.
// 반환값은 아직 같은 심벌을 보고 있을 때 적용할 갱신 함수다.
export async function resolveSymbolPlace(
  caption: string,
  latitude: number,
  longitude: number,
): Promise<((prev: TempPlace) => TempPlace) | null> {
  const [existing, results] = await Promise.all([
    findGeneralPlace({ name: caption, address: '', latitude, longitude }).catch(() => null),
    searchExternalPlaces(caption, { latitude, longitude }, { throwOnError: false }),
  ]);
  const match = findKakaoLocalMatch(caption, { latitude, longitude }, results);
  if (!match) return null;
  if (match.source === 'naver' && match.placeName.normalize('NFKC').replace(/\s/g, '') !==
      caption.normalize('NFKC').replace(/\s/g, '')) return null;
  return (prev) => ({
    ...prev,
    phone: match.phone || prev.phone,
    providerId: match.providerId,
    placeUrl: match.placeUrl,
    generalPlaceId: existing?.id ?? match.generalPlaceId ?? prev.generalPlaceId,
    // ID 없는 네이버 건물은 검색 선택과 심벌 선택의 동일한 좌표 스냅샷을 쓴다.
    ...(match.source === 'naver' && !existing && !prev.generalPlaceId ? { name: match.placeName,
      address: match.roadAddress || match.address,
      latitude: match.latitude, longitude: match.longitude } : {}),
  });
}
