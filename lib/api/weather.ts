// 라이딩 날씨 — 시간대별 예보는 기상청 단기예보(EF weather-kr 프록시)에서 받아
// 라이더 기준 적합도 점수(0~100)와 등급으로 가공한다. 강수확률(POP)이 네이버·
// 아이폰 날씨와 같은 원천이라 체감과 일치한다 (Open-Meteo 확률은 한국에서 과대).
// 경로 날씨 경고만 Open-Meteo 유지 — 멀티 좌표 1콜과 강수형태 중심 판정 때문.

import { supabase } from '@/lib/supabase';

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
  /** 날씨가 나쁜 지점 수 */
  count: number;
  /** 가장 심한 상태 — 뇌우 > 눈 > 비 > 강수 예보 순 */
  worstCondition: '뇌우' | '눈' | '비' | '강수 예보';
  /** 나쁜 지점들의 향후 3시간 최대 강수확률(%) */
  maxPop: number;
}

// 내비 출발 전 경로 지점들(출발지·경유지·목적지)의 날씨를 한 번에 확인한다.
// 문제가 없거나 확인에 실패하면 null (출발을 막지 않는 fail-open).
export async function checkRouteWeather(
  points: { latitude: number; longitude: number }[],
): Promise<RouteWeatherWarning | null> {
  if (points.length === 0) return null;
  try {
    const params = new URLSearchParams({
      latitude: points.map((p) => p.latitude.toFixed(3)).join(','),
      longitude: points.map((p) => p.longitude.toFixed(3)).join(','),
      current: 'precipitation,weather_code',
      hourly: 'precipitation_probability,weather_code',
      forecast_hours: '3',
      timezone: 'Asia/Seoul',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    // 좌표 1개면 객체, 여러 개면 배열로 온다
    const results: any[] = Array.isArray(data) ? data : [data];

    let count = 0;
    let maxPop = 0;
    let severity = 0; // 1=강수 예보, 2=비, 3=눈, 4=뇌우
    for (const r of results) {
      const codes: number[] = [r.current.weather_code, ...(r.hourly?.weather_code ?? [])];
      const pop = Math.max(0, ...((r.hourly?.precipitation_probability ?? []) as number[]));
      const hasThunder = codes.some((c) => c >= 95);
      const hasSnow = codes.some((c) => c >= 71 && c <= 86);
      const hasRain = r.current.precipitation > 0 || codes.some((c) => c >= 51 && c <= 67);
      const rainy = hasThunder || hasSnow || hasRain || pop >= 50;
      if (!rainy) continue;
      count += 1;
      maxPop = Math.max(maxPop, pop);
      severity = Math.max(severity, hasThunder ? 4 : hasSnow ? 3 : hasRain ? 2 : 1);
    }
    if (count === 0) return null;
    const worstCondition = (['강수 예보', '비', '눈', '뇌우'] as const)[severity - 1];
    return { count, worstCondition, maxPop };
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
