export function formatDistance(km: number): string {
  if (km <= 0) return '-';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

// 주행 시간 타이머 포맷 (초 → "1:23:45" 또는 "23:45")
export function formatRideDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

// 속도 포맷 (km/h)
export function formatSpeed(kmh: number): string {
  if (kmh <= 0) return '-';
  return `${kmh.toFixed(1)}km/h`;
}

// 주행 날짜 표시 (예: "2026년 6월 17일", withWeekday 시 요일 포함)
export function formatRideDate(iso: string, withWeekday = false): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withWeekday ? { weekday: 'short' as const } : {}),
  });
}
