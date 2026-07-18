// 라이딩 날씨 — 시간대별 예보는 기상청 단기예보(EF weather-kr 프록시)에서 받아
// 라이더 기준 적합도 점수(0~100)와 등급으로 가공한다. 강수확률(POP)이 네이버·
// 아이폰 날씨와 같은 원천이라 체감과 일치한다 (Open-Meteo 확률은 한국에서 과대).
// 경로 날씨 경고만 Open-Meteo 유지 — 멀티 좌표 1콜과 강수형태 중심 판정 때문.

import { supabase } from '@/lib/supabase';
import { coordToRegion } from '@/lib/api/kakaoLocal';

export interface HourlyWeather {
  hour: string; // "14시"
  temp: number;
  pop: number; // 강수확률 %
  emoji: string;
}

export interface RidingWeather {
  score: number;
  grade: '최고' | '좋음' | '보통' | '주의' | '비추천';
  gradeColor: string;
  comment: string;
  current: {
    temp: number;
    feels: number;
    humidity: number;
    windMs: number;
    pop: number;
    condition: string;
    emoji: string;
  };
  hourly: HourlyWeather[];
}

// 기상청 하늘상태(SKY)·강수형태(PTY) → 상태·이모지
function describeKma(sky: number, pty: number): { condition: string; emoji: string } {
  if (pty === 1) return { condition: '비', emoji: '🌧️' };
  if (pty === 2) return { condition: '비/눈', emoji: '🌨️' };
  if (pty === 3) return { condition: '눈', emoji: '🌨️' };
  if (pty === 4) return { condition: '소나기', emoji: '🌧️' };
  if (sky === 4) return { condition: '흐림', emoji: '☁️' };
  if (sky === 3) return { condition: '구름 많음', emoji: '⛅' };
  return { condition: '맑음', emoji: '☀️' };
}

// 체감온도 (Steadman apparent temperature) — 기상청 단기예보에 없어 자체 계산
function feelsLike(tempC: number, humidityPct: number, windMs: number): number {
  const e = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return Math.round(tempC + 0.33 * e - 0.7 * windMs - 4.0);
}

function gradeOf(score: number): {
  grade: RidingWeather['grade'];
  gradeColor: string;
  comment: string;
} {
  if (score >= 85)
    return { grade: '최고', gradeColor: '#16A34A', comment: '달리기 딱 좋은 날이에요!' };
  if (score >= 70)
    return { grade: '좋음', gradeColor: '#65A30D', comment: '라이딩하기 좋은 날씨예요.' };
  if (score >= 50)
    return { grade: '보통', gradeColor: '#D97706', comment: '무난하지만 장비를 챙기세요.' };
  if (score >= 30)
    return { grade: '주의', gradeColor: '#EA580C', comment: '컨디션이 좋지 않아요. 조심히 달리세요.' };
  return { grade: '비추천', gradeColor: '#DC2626', comment: '오늘은 쉬어 가는 게 좋겠어요.' };
}

// 라이더 기준 감점제 — 기온(15~24 최적)·강수·바람 요인
function scoreWeather(temp: number, popMax: number, pty: number, windMs: number): number {
  let score = 100;

  if (temp < 15) score -= Math.min(50, (15 - temp) * 4);
  else if (temp > 24) score -= Math.min(40, (temp - 24) * 4);

  if (pty > 0) score -= 50; // 지금 강수 형태가 있으면 (비·눈·소나기)
  if (popMax >= 60) score -= 40;
  else if (popMax >= 30) score -= 20;
  else if (popMax >= 10) score -= 8;

  if (windMs >= 10) score -= 30;
  else if (windMs >= 7) score -= 15;
  else if (windMs >= 5) score -= 8;

  if (pty === 2 || pty === 3) score -= 60; // 눈·비/눈은 라이딩 불가급

  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface RouteWeatherWarning {
  /** 강수가 예상되는 지역 이름 (행정동, 최대 3곳) — 역지오코딩 실패 시 빈 배열 */
  regions: string[];
  /** 강수가 예상되는 지점 수 */
  count: number;
  /** 가장 심한 상태 — 눈 > 비 > 강수 예보 순 */
  worstCondition: '눈' | '비' | '강수 예보';
  /** 나쁜 지점들의 향후 3시간 최대 강수확률(%) */
  maxPop: number;
}

// 경로에서 확인할 지점 수 상한 — 출발지와 도착지를 보존하고 사이를 고르게 추린다
function sampleRoutePoints<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const picked = [points[0]];
  for (let i = 1; i < max - 1; i++) {
    picked.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  }
  picked.push(points[points.length - 1]);
  return picked;
}

// 내비 출발 전 경로 지점들(출발지·경유지·목적지)의 날씨를 확인한다.
// 시간대별 시트와 같은 기상청 예보(weather-kr)를 쓰므로 두 화면의 값이 어긋나지 않고,
// 강수 지점은 행정동 이름으로 알려준다. 확인에 실패하면 null (출발을 막지 않는 fail-open).
export async function checkRouteWeather(
  points: { latitude: number; longitude: number }[],
): Promise<RouteWeatherWarning | null> {
  if (points.length === 0) return null;
  try {
    const sampled = sampleRoutePoints(points, 4);
    const results = await Promise.all(
      sampled.map(async (p) => {
        const { data, error } = await supabase.functions.invoke('weather-kr', {
          body: { lat: p.latitude, lng: p.longitude },
        });
        if (error) return null;
        const hours: KmaHour[] = data?.hours ?? [];
        return { point: p, hours };
      }),
    );

    let maxPop = 0;
    let severity = 0; // 1=강수 예보(확률만) 2=비 3=눈
    const rainyPoints: { latitude: number; longitude: number }[] = [];
    for (const r of results) {
      if (!r || r.hours.length === 0) continue;
      const soon = r.hours.slice(0, 3); // 향후 3시간
      const pop = Math.max(0, ...soon.map((h) => h.pop));
      const ptys = soon.map((h) => h.pty);
      const hasSnow = ptys.some((t) => t === 2 || t === 3);
      const hasRain = ptys.some((t) => t === 1 || t === 4);
      if (!hasSnow && !hasRain && pop < 60) continue;
      rainyPoints.push(r.point);
      maxPop = Math.max(maxPop, pop);
      severity = Math.max(severity, hasSnow ? 3 : hasRain ? 2 : 1);
    }
    if (rainyPoints.length === 0) return null;

    // 어느 지역인지 이름으로 보여준다 — 실패한 지점은 조용히 제외
    const names = await Promise.all(
      rainyPoints.map((p) => coordToRegion(p.latitude, p.longitude)),
    );
    const regions = [...new Set(names.filter((n): n is string => !!n))].slice(0, 3);

    const worstCondition = (['강수 예보', '비', '눈'] as const)[severity - 1];
    return { regions, count: rainyPoints.length, worstCondition, maxPop };
  } catch {
    return null;
  }
}

interface KmaHour {
  date: string; // "20260717"
  time: string; // "1800"
  tmp: number | null;
  pop: number;
  pty: number;
  sky: number;
  wsd: number | null;
  reh: number | null;
}

export async function fetchRidingWeather(latitude: number, longitude: number): Promise<RidingWeather> {
  const { data, error } = await supabase.functions.invoke('weather-kr', {
    body: { lat: latitude, lng: longitude },
  });
  if (error) throw new Error(`날씨 요청 실패 (${error.message})`);
  const hours: KmaHour[] = data?.hours ?? [];
  if (hours.length === 0) throw new Error('날씨 데이터가 비어 있습니다');

  const next12 = hours.slice(0, 12);
  const hourly: HourlyWeather[] = next12.map((h) => ({
    hour: `${parseInt(h.time.slice(0, 2), 10)}시`,
    temp: Math.round(h.tmp ?? 0),
    pop: h.pop,
    emoji: describeKma(h.sky, h.pty).emoji,
  }));

  const now = hours[0];
  const temp = now.tmp ?? 0;
  const windMs = now.wsd ?? 0;
  // 점수는 라이딩 판단에 유의미한 향후 6시간의 강수확률만 반영 (표시는 12시간)
  const popMax = Math.max(0, ...next12.slice(0, 6).map((h) => h.pop));
  const score = scoreWeather(temp, popMax, now.pty, windMs);
  const { condition, emoji } = describeKma(now.sky, now.pty);

  return {
    score,
    ...gradeOf(score),
    current: {
      temp: Math.round(temp),
      feels: feelsLike(temp, now.reh ?? 50, windMs),
      humidity: now.reh ?? 0,
      windMs: Math.round(windMs * 10) / 10,
      pop: now.pop,
      condition,
      emoji,
    },
    hourly,
  };
}
