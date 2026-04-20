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
