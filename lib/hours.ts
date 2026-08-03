// 영업시간 판정. places.hours(jsonb)와 구글 Places 응답이 같은 모양으로 들어와
// 여기서 한 번에 처리된다.
//
// 시각은 기기 로컬을 쓴다. 국내 장소를 국내에서 보는 게 사실상 전부라 KST 로
// 굳이 변환하지 않는다 — 해외에서 열면 어긋나지만, 그때는 갈 수 있는 상황이 아니다.

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface HoursSpan {
  open: string; // "11:00"
  close: string; // "02:00" — open 보다 작으면 익일, "24:00" 은 자정
}

/** 요일별 영업 구간. []는 그날 휴무(확정), 없거나 null 이면 모름. */
export type Hours = Partial<Record<DayKey, HoursSpan[] | null>> & {
  /** 시간표로 표현 못 하는 것 — "우천 휴무", "라스트오더 24:00" */
  note?: string;
};

export type OpenState =
  | { status: 'open'; until: string }
  | { status: 'closed'; opensAt?: string; dayOff: boolean }
  | { status: 'unknown' };

// Date.getDay() 순서
const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

/** 표시·입력 순서 (월요일 시작) */
export const WEEK: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function spansOf(hours: Hours, day: DayKey): HoursSpan[] | null {
  const v = hours[day];
  return Array.isArray(v) ? v : null;
}

/**
 * 지금 영업중인지. 판단할 근거가 없으면 'unknown' — 이때는 아무것도 표시하지
 * 않는다. 틀린 "영업중"은 정보가 없는 것보다 나쁘다.
 */
export function getOpenState(hours: Hours | null | undefined, now = new Date()): OpenState {
  if (!hours) return { status: 'unknown' };

  const dow = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();

  // 어제 시작한 영업이 자정을 넘겨 지금까지 이어질 수 있다 (11:00-02:00 의 새벽 1시)
  const yesterday = spansOf(hours, DAYS[(dow + 6) % 7]);
  for (const s of yesterday ?? []) {
    const open = toMinutes(s.open);
    const close = toMinutes(s.close);
    if (open == null || close == null) continue;
    if (close <= open && cur < close) return { status: 'open', until: s.close };
  }

  const today = spansOf(hours, DAYS[dow]);
  if (!today) return { status: 'unknown' };

  for (const s of today) {
    const open = toMinutes(s.open);
    const close = toMinutes(s.close);
    if (open == null || close == null) continue;
    const end = close <= open ? close + 1440 : close;
    if (cur >= open && cur < end) return { status: 'open', until: s.close };
  }

  // 오늘 남은 영업 중 가장 이른 것
  const upcoming = today
    .map((s) => ({ span: s, at: toMinutes(s.open) }))
    .filter((x): x is { span: HoursSpan; at: number } => x.at != null && x.at > cur)
    .sort((a, b) => a.at - b.at)[0];

  return { status: 'closed', opensAt: upcoming?.span.open, dayOff: today.length === 0 };
}

/** 카드에 한 줄로 띄울 문구. 표시할 게 없으면 null. */
export function describeOpenState(state: OpenState): { text: string; open: boolean } | null {
  if (state.status === 'unknown') return null;
  if (state.status === 'open') return { text: `영업중 · ${state.until} 마감`, open: true };
  if (state.dayOff) return { text: '오늘 휴무', open: false };
  return {
    text: state.opensAt ? `영업 전 · ${state.opensAt} 오픈` : '영업 종료',
    open: false,
  };
}

/**
 * 요일별 구간을 사람이 읽는 줄로 접는다 — 같은 시간대가 이어지는 요일을 묶어
 * "월~금 11:00-02:00" 처럼 만든다.
 */
export function formatWeek(hours: Hours): string[] {
  const key = (day: DayKey) => {
    const spans = spansOf(hours, day);
    if (!spans) return null; // 모름 — 줄에서 뺀다
    if (spans.length === 0) return '휴무';
    return spans.map((s) => `${s.open}-${s.close}`).join(', ');
  };

  const lines: string[] = [];
  let runStart: DayKey | null = null;
  let runEnd: DayKey | null = null;
  let runKey: string | null = null;

  const flush = () => {
    if (!runStart || !runEnd || runKey == null) return;
    const label =
      runStart === runEnd
        ? DAY_LABELS[runStart]
        : `${DAY_LABELS[runStart]}~${DAY_LABELS[runEnd]}`;
    lines.push(`${label} ${runKey}`);
    runStart = runEnd = runKey = null;
  };

  for (const day of WEEK) {
    const k = key(day);
    if (k == null) {
      flush();
      continue;
    }
    if (k === runKey) {
      runEnd = day;
      continue;
    }
    flush();
    runStart = runEnd = day;
    runKey = k;
  }
  flush();

  return lines;
}
