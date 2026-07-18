// 일출·일몰 시각 계산 — suncalc(mourner/suncalc, MIT) 알고리즘 이식.
// 외부 API 없이 위경도와 날짜만으로 구한다 (오차 2분 이내, 라이딩 계획엔 충분).

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // 지구 자전축 기울기

const toDays = (date: Date) => date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m: number) =>
  m +
  RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) +
  RAD * 102.9372 +
  Math.PI;

const julianCycle = (d: number, lw: number) => Math.round(d - 0.0009 - lw / (2 * Math.PI));
const approxTransit = (ht: number, lw: number, n: number) =>
  0.0009 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, m: number, l: number) =>
  J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

function toHHMM(j: number): string {
  const kst = new Date(fromJulian(j) + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

export function sunTimes(
  latitude: number,
  longitude: number,
  date = new Date(),
): { sunrise: string; sunset: string } | null {
  const lw = RAD * -longitude;
  const phi = RAD * latitude;

  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = Math.asin(Math.sin(l) * Math.sin(E));
  const jNoon = solarTransitJ(ds, m, l);

  // 시민 일출·일몰 기준 고도 -0.833° (대기 굴절 + 태양 반지름)
  const cosH =
    (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return null; // 백야·극야 (한국에선 없음)
  const w = Math.acos(cosH);

  const jSet = solarTransitJ(approxTransit(w, lw, n), m, l);
  const jRise = jNoon - (jSet - jNoon);
  return { sunrise: toHHMM(jRise), sunset: toHHMM(jSet) };
}
