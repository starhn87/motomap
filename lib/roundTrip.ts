// 내 위치 기준 코스 왕복 예상 시간 — "지금 나가면 몇 시간짜리 라이딩인가"에 답한다.
// 접근·복귀는 직선거리에 도로 우회 계수를 적용한 근사(경로 API 호출 없이 전 코스
// 일괄 계산). 왕복 = 접근 + 코스 주행 + 복귀.

const ROAD_FACTOR = 1.35; // 직선거리 → 실도로 거리 보정
const APPROACH_KMH = 50; // 접근·복귀 평균 속도 (시내·교외 혼합)

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function estimateRoundTripMinutes(
  user: { latitude: number; longitude: number },
  course: { duration: number; coordinates: [number, number][] },
): number | null {
  const coords = course.coordinates;
  if (!coords || coords.length === 0) return null;
  const [startLng, startLat] = coords[0];
  const [endLng, endLat] = coords[coords.length - 1];
  const approachKm = haversineKm(user.latitude, user.longitude, startLat, startLng) * ROAD_FACTOR;
  const returnKm = haversineKm(endLat, endLng, user.latitude, user.longitude) * ROAD_FACTOR;
  const travelMin = ((approachKm + returnKm) / APPROACH_KMH) * 60;
  return Math.round(travelMin + course.duration);
}
