export const DIFFICULTY_OPTIONS = [
  { key: 'easy' as const, label: '초급', color: '#22C55E' },
  { key: 'medium' as const, label: '중급', color: '#F59E0B' },
  { key: 'hard' as const, label: '상급', color: '#EF4444' },
];

export const DIFFICULTY_CONFIG: Record<
  'easy' | 'medium' | 'hard',
  { label: string; color: string }
> = {
  easy: { label: '초급', color: '#22C55E' },
  medium: { label: '중급', color: '#F59E0B' },
  hard: { label: '상급', color: '#EF4444' },
};

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
