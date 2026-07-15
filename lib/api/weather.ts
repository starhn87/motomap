// 라이딩 날씨 — Open-Meteo(무료, 키 불필요)에서 현재·시간별 예보를 받아
// 라이더 기준 적합도 점수(0~100)와 등급으로 가공한다.

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

// WMO weather code → 상태·이모지
function describeCode(code: number): { condition: string; emoji: string } {
  if (code === 0) return { condition: '맑음', emoji: '☀️' };
  if (code <= 2) return { condition: '구름 조금', emoji: '🌤️' };
  if (code === 3) return { condition: '흐림', emoji: '☁️' };
  if (code === 45 || code === 48) return { condition: '안개', emoji: '🌫️' };
  if (code <= 57) return { condition: '이슬비', emoji: '🌦️' };
  if (code <= 67) return { condition: '비', emoji: '🌧️' };
  if (code <= 77) return { condition: '눈', emoji: '🌨️' };
  if (code <= 82) return { condition: '소나기', emoji: '🌧️' };
  if (code <= 86) return { condition: '소낙눈', emoji: '🌨️' };
  return { condition: '뇌우', emoji: '⛈️' };
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

// 라이더 기준 감점제 — 기온(15~24 최적)·강수·바람·시정 요인
function scoreWeather(temp: number, popMax: number, precip: number, windMs: number, code: number): number {
  let score = 100;

  if (temp < 15) score -= Math.min(50, (15 - temp) * 4);
  else if (temp > 24) score -= Math.min(40, (temp - 24) * 4);

  if (precip > 0) score -= 50;
  if (popMax >= 60) score -= 40;
  else if (popMax >= 30) score -= 20;
  else if (popMax >= 10) score -= 8;

  if (windMs >= 10) score -= 30;
  else if (windMs >= 7) score -= 15;
  else if (windMs >= 5) score -= 8;

  if (code === 45 || code === 48) score -= 15; // 안개
  if (code >= 95) score -= 60; // 뇌우
  if (code >= 71 && code <= 86) score -= 60; // 눈

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function fetchRidingWeather(latitude: number, longitude: number): Promise<RidingWeather> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    forecast_days: '2',
    timezone: 'Asia/Seoul',
    wind_speed_unit: 'ms',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`날씨 요청 실패 (HTTP ${res.status})`);
  const data = await res.json();

  const cur = data.current;
  const hourlyTimes: string[] = data.hourly.time;

  // 현재 시각 이후 6시간 슬라이스
  const nowIdx = hourlyTimes.findIndex((t) => new Date(t).getTime() > Date.now()) - 1;
  const startIdx = Math.max(0, nowIdx);
  const next6 = Array.from({ length: 6 }, (_, i) => startIdx + i).filter(
    (i) => i < hourlyTimes.length,
  );

  const hourly: HourlyWeather[] = next6.map((i) => ({
    hour: `${new Date(hourlyTimes[i]).getHours()}시`,
    temp: Math.round(data.hourly.temperature_2m[i]),
    pop: data.hourly.precipitation_probability[i] ?? 0,
    emoji: describeCode(data.hourly.weather_code[i]).emoji,
  }));

  const popMax = Math.max(0, ...hourly.map((h) => h.pop));
  const score = scoreWeather(cur.temperature_2m, popMax, cur.precipitation, cur.wind_speed_10m, cur.weather_code);
  const { condition, emoji } = describeCode(cur.weather_code);

  return {
    score,
    ...gradeOf(score),
    current: {
      temp: Math.round(cur.temperature_2m),
      feels: Math.round(cur.apparent_temperature),
      humidity: cur.relative_humidity_2m,
      windMs: Math.round(cur.wind_speed_10m * 10) / 10,
      pop: hourly[0]?.pop ?? 0,
      condition,
      emoji,
    },
    hourly,
  };
}
