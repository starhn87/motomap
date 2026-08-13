interface Coord {
  latitude: number;
  longitude: number;
}

export function haversine(a: Coord, b: Coord): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(a.latitude);
  const phi2 = toRad(b.latitude);
  const dPhi = toRad(b.latitude - a.latitude);
  const dLambda = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// 짧은 거리의 평면 근사(m) — 한국 위도대 상수(위도 1도 ≈ 111km, 경도 1도 ≈ 88km)를
// 한 곳에 둔다. 수십 km 이내의 비교·정렬에는 충분하고 haversine 보다 싸다.
// 장거리·정밀 거리는 haversine 을 쓴다.
export function approxMeters(a: Coord, b: Coord): number {
  return Math.hypot((a.latitude - b.latitude) * 111000, (a.longitude - b.longitude) * 88000);
}
