// 코스 태그와 현재 달을 대조해 "지금이 제철" 뱃지를 돌려준다 (해당 없으면 null).
// icon 은 MaterialCommunityIcons 이름, color 는 계절 시그니처 색 — 모노톤 틴트로는
// 계절감이 살지 않아 뱃지에서 유일하게 색을 쓴다.
const SEASONAL: { months: number[]; tags: string[]; icon: string; color: string }[] = [
  { months: [3, 4], tags: ['벚꽃', '봄'], icon: 'flower', color: '#EC4899' },
  { months: [6, 7, 8], tags: ['계곡', '바다', '해안', '여름'], icon: 'waves', color: '#0EA5E9' },
  { months: [10, 11], tags: ['단풍', '억새', '가을'], icon: 'leaf-maple', color: '#EA580C' },
];

export function seasonalBadge(
  tags: string[]
): { icon: string; label: string; color: string } | null {
  const month = new Date().getMonth() + 1;
  for (const season of SEASONAL) {
    if (season.months.includes(month) && tags.some((t) => season.tags.includes(t))) {
      return { icon: season.icon, label: '지금이 제철', color: season.color };
    }
  }
  return null;
}

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
