// 라이딩 날씨 — 시간대별 예보는 기상청 단기예보(EF weather-kr 프록시)에서 받아
// 라이더 기준 적합도 점수(0~100)와 등급으로 가공한다. 강수확률(POP)이 네이버·
// 아이폰 날씨와 같은 원천이라 체감과 일치한다 (Open-Meteo 확률은 한국에서 과대).
// 경로 날씨 경고만 Open-Meteo 유지 — 멀티 좌표 1콜과 강수형태 중심 판정 때문.

import { supabase } from '@/lib/supabase';
import { coordToRegion } from '@/lib/api/kakaoLocal';
import { isNightAt } from '@/lib/sun';
import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';

export interface HourlyWeather {
  /** KMA 예보 시각을 KST에서 절대 시각으로 변환한 ISO 문자열 */
  at: string;
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

// 기상청 낙뢰(LGT)·강수형태(PTY)·하늘상태(SKY) → 상태·이모지.
// 위험도가 높은 상태가 주야 아이콘보다 우선한다.
function describeKma(
  sky: number,
  pty: number,
  night: boolean,
  lgt = 0,
): { condition: string; emoji: string } {
  if (lgt > 0) return { condition: '천둥·번개', emoji: '⛈️' };
  if (pty === 1) return { condition: '비', emoji: '🌧️' };
  if (pty === 2) return { condition: '비/눈', emoji: '🌨️' };
  if (pty === 3) return { condition: '눈', emoji: '🌨️' };
  if (pty === 4) return { condition: '소나기', emoji: '🌧️' };
  if (sky === 4) return { condition: '흐림', emoji: '☁️' };
  if (sky === 3) {
    return {
      condition: '구름 많음',
      emoji: night ? NIGHT_PARTLY_CLOUDY_EMOJI : '⛅',
    };
  }
  return { condition: '맑음', emoji: night ? '🌙' : '☀️' };
}

// 체감온도 (Steadman apparent temperature) — 기상청 단기예보에 없어 자체 계산
function feelsLike(tempC: number, humidityPct: number, windMs: number): number {
  const e = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return Math.round(tempC + 0.33 * e - 0.7 * windMs - 4.0);
}

function gradeOf(score: number): {
  grade: RidingWeather['grade'];
  gradeColor: string;
} {
  if (score >= 85) return { grade: '최고', gradeColor: '#16A34A' };
  if (score >= 70) return { grade: '좋음', gradeColor: '#65A30D' };
  if (score >= 50) return { grade: '보통', gradeColor: '#D97706' };
  if (score >= 30) return { grade: '주의', gradeColor: '#EA580C' };
  return { grade: '비추천', gradeColor: '#DC2626' };
}

// 시간대를 읽는 코멘트 — 하루를 통째로 재단하지 않고 "언제까지 괜찮은지,
// 언제부터 갤지"를 말한다. 라이딩은 한두 시간짜리도 많아서 비 없는 창을
// 짚어주는 쪽이 실제 출발 판단에 맞다.
// 시트 부제목 — 두 문장이라 문장마다 줄을 나눠야 한눈에 읽힌다
function commentFor(hours: KmaHour[], temp: number, windMs: number): string {
  return buildComment(hours, temp, windMs).replace(/\. /g, '.\n');
}

function buildComment(hours: KmaHour[], temp: number, windMs: number): string {
  const next12 = hours.slice(0, 12);
  const isRainy = (h: KmaHour) => h.pty > 0 || h.pop >= 60;
  const isLightning = (h: KmaHour) => (h.lgt ?? 0) > 0;
  const hourLabel = (h: KmaHour) => `${parseInt(h.time.slice(0, 2), 10)}시`;
  const lightningIdx = next12.findIndex((h, index) => index > 0 && isLightning(h));
  const rainIdx = next12.findIndex((h, index) => index > 0 && isRainy(h));

  if (isLightning(next12[0])) {
    return '지금 천둥·번개 가능성이 있어요. 라이딩을 미루는 게 안전해요.';
  }
  if (isRainy(next12[0])) {
    const clearIdx = next12.findIndex(
      (h, index) => index > 0 && !isRainy(h) && !isLightning(h),
    );
    if (lightningIdx > 0) {
      if (clearIdx > 0 && clearIdx < lightningIdx) {
        return `지금은 비 소식이 있어요. ${hourLabel(next12[clearIdx])}부터 잠시 갤 수 있지만, ${hourLabel(next12[lightningIdx])}쯤 천둥·번개 가능성이 있어요.`;
      }
      return `지금 비가 이어지고 있어요. ${hourLabel(next12[lightningIdx])}쯤 천둥·번개까지 예상돼요.`;
    }
    if (clearIdx === -1) return '당분간 비가 이어져요. 오늘은 쉬어 가는 게 좋겠어요.';
    return `지금은 비 소식이 있어요. ${hourLabel(next12[clearIdx])}부터는 갤 것 같아요.`;
  }
  // 가장 먼저 도달하는 위험을 안내하고, 같은 시각이면 번개를 우선한다.
  if (lightningIdx > 0 && (rainIdx === -1 || lightningIdx <= rainIdx)) {
    return `${hourLabel(next12[lightningIdx])}쯤 천둥·번개 가능성이 있어요. 그 전에 돌아오는 게 좋아요.`;
  }
  if (rainIdx > 0 && rainIdx <= 2) {
    return `${hourLabel(next12[rainIdx])}쯤 비가 시작될 것 같아요. 멀리 가긴 애매해요.`;
  }
  if (rainIdx > 2) {
    return `${hourLabel(next12[rainIdx])} 전까지는 비 소식이 없어요. 그 안에 다녀오기 좋아요.`;
  }
  if (windMs >= 7) return '비 소식은 없지만 바람이 강해요. 옆바람을 조심하세요.';
  if (temp > 28) return '비 걱정은 없어요. 한낮 더위와 노면 열기만 조심하세요.';
  if (temp < 5) return '비 소식은 없지만 많이 추워요. 방한을 단단히 하세요.';
  if (temp < 15) return '비 걱정 없이 달릴 수 있어요. 쌀쌀하니 겉옷을 챙기세요.';
  return '앞으로 비 소식 없이 달리기 좋아요.';
}

// 라이더 기준 감점제 — 기온(15~24 최적)·강수·바람 요인
function scoreWeather(
  temp: number,
  popMax: number,
  pty: number,
  windMs: number,
  lgt: number,
): number {
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
  if (lgt > 0) score -= 60; // 낙뢰 가능성도 라이딩 불가급

  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface RouteWeatherWarning {
  /** 위험 기상이 예상되는 지역 이름 (행정동, 최대 3곳) — 역지오코딩 실패 시 빈 배열 */
  regions: string[];
  /** 위험 기상이 예상되는 지점 수 */
  count: number;
  /** 가장 심한 상태 — 천둥·번개 > 눈 > 비 > 강수 예보 순 */
  worstCondition: '천둥·번개' | '눈' | '비' | '강수 예보';
  /** 위험 지점들의 향후 3시간 최대 강수확률(%) */
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
    let severity = 0; // 1=강수 예보(확률만) 2=비 3=눈 4=천둥·번개
    const hazardPoints: { latitude: number; longitude: number }[] = [];
    for (const r of results) {
      if (!r || r.hours.length === 0) continue;
      const soon = r.hours.slice(0, 3); // 향후 3시간
      const pop = Math.max(0, ...soon.map((h) => h.pop));
      const ptys = soon.map((h) => h.pty);
      const hasSnow = ptys.some((t) => t === 2 || t === 3);
      const hasRain = ptys.some((t) => t === 1 || t === 4);
      const hasLightning = soon.some((h) => (h.lgt ?? 0) > 0);
      if (!hasLightning && !hasSnow && !hasRain && pop < 60) continue;
      hazardPoints.push(r.point);
      maxPop = Math.max(maxPop, pop);
      severity = Math.max(severity, hasLightning ? 4 : hasSnow ? 3 : hasRain ? 2 : 1);
    }
    if (hazardPoints.length === 0) return null;

    // 어느 지역인지 이름으로 보여준다 — 실패한 지점은 조용히 제외
    const names = await Promise.all(
      hazardPoints.map((p) => coordToRegion(p.latitude, p.longitude)),
    );
    const regions = [...new Set(names.filter((n): n is string => !!n))].slice(0, 3);

    const worstCondition = (['강수 예보', '비', '눈', '천둥·번개'] as const)[severity - 1];
    return { regions, count: hazardPoints.length, worstCondition, maxPop };
  } catch {
    return null;
  }
}

// ── 기상특보 ──────────────────────────────────────────────────────────────

export interface WeatherWarning {
  /** 특보 종류 — "폭염", "호우", "강풍", "태풍" 등 */
  type: string;
  level: '경보' | '주의보';
  /** 통보문의 발효 지역 원문 — "서울특별시, 경기도(수원시, ...)" */
  regions: string;
}

/** 전국 발효 특보 (EF weather-warnings, 10분 캐시). 실패해도 시트가 떠야 하니 빈 배열. */
export async function fetchWeatherWarnings(): Promise<WeatherWarning[]> {
  try {
    const { data, error } = await supabase.functions.invoke('weather-warnings');
    if (error) return [];
    return data?.warnings ?? [];
  } catch {
    return [];
  }
}

// 통보문의 축약 시/도 표기 ("경기", "전남") 대응
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

// 특보 종류별 라이더 유의사항 — 통보문의 일반 유의문은 길고 자동차 중심이라,
// 라이딩 관점의 한 줄로 바꿔 칩 탭 안내에 쓴다. 없는 종류는 목록만 보여준다.
export const WARNING_RIDER_TIPS: Record<string, string> = {
  폭염: '한낮 노면 열기와 탈수 위험이 커요. 수분을 자주 보충하고 무리한 장거리는 피하세요.',
  열대야: '밤에도 더위가 이어져요. 야간 주행에도 수분 보충을 챙기세요.',
  호우: '빗길은 제동거리가 길어지고 수막현상 위험이 있어요. 감속하고 급제동을 피하세요.',
  태풍: '강풍과 폭우가 함께 와요. 라이딩을 미루는 게 안전해요.',
  강풍: '옆바람에 차선 이탈 위험이 있어요. 감속하고 대형차 옆을 피하세요.',
  대설: '노면 적설·결빙은 이륜차에 극히 위험해요. 라이딩을 미루세요.',
  한파: '블랙아이스 위험이 있어요. 그늘진 커브·다리 위를 특히 조심하세요.',
  안개: '시야가 짧아져요. 전조등을 켜고 감속, 차간 거리를 넉넉히 두세요.',
  건조: '산불 위험이 큰 시기예요. 흡연·불씨에 유의하세요.',
  풍랑: '해안 도로에 월파 위험이 있어요. 해안길 주행을 피하세요.',
  폭풍해일: '해안 저지대가 침수될 수 있어요. 해안길 주행을 피하세요.',
};

// "강원특별자치도"/"강원도"/"강원" 을 같은 키로 — 통보문은 구명칭·축약이 섞인다
function sidoKeyOf(name: string): string {
  // "자치도"는 통보문의 "전북자치도" 같은 준말 대응 (정식명은 SIDO_SHORT 가 먼저 잡는다)
  return SIDO_SHORT[name] ?? name.replace(/(특별자치도|특별자치시|자치도|특별시|광역시|도)$/, '');
}

// 괄호 안 내용 제거 — "신안(흑산면제외)" → "신안". 하위 행정단위 부기를 걷어내
// 항목 자체의 표기만 남긴다.
function stripParens(s: string): string {
  let depth = 0;
  let out = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

// 최상위 쉼표로 지역 토큰 분리 — 괄호 안 쉼표("경기도(수원시, 성남시)")는 유지
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * 전국 특보 중 이 지역에 발효 중인 것만 고른다.
 * 통보문 표기(실측): 시/도 단독("서울특별시")이면 전역, 괄호 열거는 세부 특보구역
 * ("강원도(속초산지, 양양평지)")이거나 시군구("경기도(수원시, ...)"), "제외" 열거
 * ("경기도(광주시 제외)")면 나머지 전역. 세부구역이 "속초산지"처럼 접미사가 붙어
 * 시군구 정식명으로는 안 걸리므로 어간("속초")으로 대조한다.
 */
export function warningsForRegion(
  warnings: WeatherWarning[],
  parts: { sido: string; sigungu: string } | null,
): WeatherWarning[] {
  if (!parts) return [];
  // 카카오 2depth 는 일반구가 있는 시에서 "수원시 팔달구"처럼 온다 — 시 단위 첫 토큰의 어간만
  const stem = parts.sigungu.split(' ')[0].replace(/(시|군|구)$/, '');
  const myKey = sidoKeyOf(parts.sido);
  const stemOk = stem.length >= 2;
  return warnings.filter((w) => {
    for (const token of splitTopLevel(w.regions)) {
      const m = token.match(/^([^(]+?)\s*(?:\((.*)\))?$/);
      if (!m) continue;
      const head = m[1].trim();
      const inner = m[2];
      if (sidoKeyOf(head) === myKey) {
        if (inner == null) return true; // 시/도 전역
        // "제외"는 두 층위다: 항목 수준("광주시 제외" — 시/도 전역에서 그 항목만 빼기)과
        // 하위 괄호 안("신안(흑산면제외)" — 그 시군구는 포함이되 일부 면만 빼기).
        // 항목 괄호 밖의 '제외'만 제외 열거로 판정한다.
        const entries = splitTopLevel(inner);
        const exclusion = entries.some((e) => stripParens(e).includes('제외'));
        if (exclusion) {
          const excluded =
            stemOk &&
            entries.some((e) => stripParens(e).includes('제외') && e.includes(stem));
          if (!excluded) return true;
        } else if (stemOk && entries.some((e) => e.includes(stem))) {
          return true;
        }
        continue;
      }
      // 시/도 없이 지역명 직접 표기("울릉도.독도" 등)
      if (stemOk && head.includes(stem)) return true;
    }
    return false;
  });
}

interface KmaHour {
  date: string; // "20260717"
  time: string; // "1800"
  tmp: number | null;
  pop: number;
  pty: number;
  sky: number;
  /** 초단기예보 낙뢰 가능성. 단기예보 범위나 이전 함수 응답에는 없을 수 있다. */
  lgt?: number;
  wsd: number | null;
  reh: number | null;
}

// 기상청 date/time은 KST이므로 기기 시간대와 무관한 절대 시각으로 바꾼다.
function kmaHourAt(hour: KmaHour): Date {
  const year = Number(hour.date.slice(0, 4));
  const month = Number(hour.date.slice(4, 6));
  const day = Number(hour.date.slice(6, 8));
  const hours = Number(hour.time.slice(0, 2));
  const minutes = Number(hour.time.slice(2, 4));
  return new Date(Date.UTC(year, month - 1, day, hours - 9, minutes));
}

export async function fetchRidingWeather(latitude: number, longitude: number): Promise<RidingWeather> {
  const { data, error } = await supabase.functions.invoke('weather-kr', {
    body: { lat: latitude, lng: longitude },
  });
  if (error) throw new Error(`날씨 요청 실패 (${error.message})`);
  const hours: KmaHour[] = data?.hours ?? [];
  if (hours.length === 0) throw new Error('날씨 데이터가 비어 있습니다');

  const next12 = hours.slice(0, 12);
  const hourly: HourlyWeather[] = next12.map((h) => {
    const at = kmaHourAt(h);
    return {
      at: at.toISOString(),
      hour: `${parseInt(h.time.slice(0, 2), 10)}시`,
      temp: Math.round(h.tmp ?? 0),
      pop: h.pop,
      emoji: describeKma(
        h.sky,
        h.pty,
        isNightAt(latitude, longitude, at),
        h.lgt ?? 0,
      ).emoji,
    };
  });

  const now = hours[0];
  const temp = now.tmp ?? 0;
  const windMs = now.wsd ?? 0;
  // 점수는 라이딩 판단에 유의미한 향후 6시간의 강수확률만 반영 (표시는 12시간)
  const popMax = Math.max(0, ...next12.slice(0, 6).map((h) => h.pop));
  const lgtMax = Math.max(0, ...next12.slice(0, 6).map((h) => h.lgt ?? 0));
  const score = scoreWeather(temp, popMax, now.pty, windMs, lgtMax);
  const { condition, emoji } = describeKma(
    now.sky,
    now.pty,
    isNightAt(latitude, longitude),
    now.lgt ?? 0,
  );

  return {
    score,
    ...gradeOf(score),
    comment: commentFor(hours, temp, windMs),
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
