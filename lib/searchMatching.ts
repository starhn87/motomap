import { approxMeters } from '@/lib/distance';

const normalizePlaceName = (name: string) => name.replace(/\s/g, '').toLowerCase();

// 등록 장소와 외부 일반 장소가 같은 곳인지 — 이름(정규화) 일치 + 좌표 근접.
// 제보 폼이 외부 좌표를 그대로 쓰므로 20m 이내는 이름이 조금 달라도 동일 장소다.
export function isSamePlace(
  place: { name: string; latitude: number; longitude: number },
  external: { name: string; latitude: number; longitude: number },
): boolean {
  const distance = approxMeters(place, external);
  if (distance > 150) return false;
  if (distance < 20) return true;
  const placeName = normalizePlaceName(place.name);
  const externalName = normalizePlaceName(external.name);
  return (
    externalName === placeName ||
    externalName.includes(placeName) ||
    placeName.includes(externalName)
  );
}

/** 안정 ID 없는 건물 결과는 같은 좌표의 다른 상호와 합치지 않는다. */
export function isSameExternalPlace(
  place: { name: string; latitude: number; longitude: number },
  external: { placeName: string; latitude: number; longitude: number; source?: string },
): boolean {
  if (external.source === 'naver' &&
      normalizePlaceName(place.name.normalize('NFKC')) !== normalizePlaceName(external.placeName.normalize('NFKC'))) return false;
  return isSamePlace(place, { ...external, name: external.placeName });
}
