// 일출·일몰 시각 계산 — suncalc(mourner/suncalc, MIT) 알고리즘 이식.
// 외부 API 없이 위경도와 날짜만으로 구한다 (오차 2분 이내, 라이딩 계획엔 충분).

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;
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

/** 좌표별 일출·일몰을 기준으로 특정 절대 시각이 밤인지 판정한다. */
export function isNightAt(latitude: number, longitude: number, at = new Date()): boolean {
  if (!Number.isFinite(at.getTime())) return false;
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  // KST 해당 날짜의 정오를 넣어 자정 부근에도 앞뒤 날짜의 태양 시각이 섞이지 않게 한다.
  const kstNoon = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 3),
  );
  const times = sunTimes(latitude, longitude, kstNoon);
  if (!times) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const toMinutes = (hhmm: string) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return hour * 60 + minute;
  };
  return minutes < toMinutes(times.sunrise) || minutes >= toMinutes(times.sunset);
}

export interface SunEvent {
  type: 'sunrise' | 'sunset';
  at: Date;
  /** "05:25" 형태 (KST) */
  time: string;
}

// 오늘과 내일의 일출·일몰을 시각순으로 — 시간대별 예보 사이에 끼워 넣는 용도
export function sunEvents(latitude: number, longitude: number, now = new Date()): SunEvent[] {
  const events: SunEvent[] = [];
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  for (const dayOffset of [0, 1]) {
    const year = kst.getUTCFullYear();
    const month = kst.getUTCMonth();
    const day = kst.getUTCDate() + dayOffset;
    // 대상 KST 날짜의 정오를 사용해야 자정 직후에도 전날 태양 시각이 섞이지 않는다.
    const kstNoon = new Date(Date.UTC(year, month, day, 3));
    const t = sunTimes(latitude, longitude, kstNoon);
    if (!t) continue;
    for (const type of ['sunrise', 'sunset'] as const) {
      const hhmm = type === 'sunrise' ? t.sunrise : t.sunset;
      const [h, m] = hhmm.split(':').map(Number);
      const kstDayStart = Date.UTC(year, month, day) - KST_OFFSET_MS;
      events.push({ type, at: new Date(kstDayStart + (h * 60 + m) * 60000), time: hhmm });
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
