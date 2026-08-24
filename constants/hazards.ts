import type { HazardType } from '@/types';

// 위험 정보는 실제 주행 판단에 의미가 있는 도시권 확대 수준부터 보여준다.
// 네이티브 POI·등록 장소보다 위에 두되 내 위치(300,000)는 가리지 않는다.
export const HAZARD_MIN_ZOOM = 10;
export const HAZARD_MARKER_GLOBAL_Z_INDEX = 250_000;

// 노면 위험 유형 — 라이더를 넘어뜨리는 것들. 자동차엔 사소해도 이륜차엔 치명적이다.
// icon 은 MaterialCommunityIcons 이름.
export const HAZARDS: Record<HazardType, { label: string; icon: string; color: string }> = {
  sand: { label: '모래·자갈', icon: 'dots-hexagon', color: '#D97706' },
  oil: { label: '기름·미끄럼', icon: 'oil', color: '#7C3AED' },
  pothole: { label: '포트홀·파임', icon: 'road-variant', color: '#DC2626' },
  rockfall: { label: '낙석·흙', icon: 'image-filter-hdr', color: '#78716C' },
  ice: { label: '결빙', icon: 'snowflake', color: '#0284C7' },
  construction: { label: '공사 구간', icon: 'traffic-cone', color: '#EA580C' },
  etc: { label: '기타 위험', icon: 'alert', color: '#B91C1C' },
};

export const HAZARD_LIST = Object.entries(HAZARDS).map(([key, value]) => ({
  key: key as HazardType,
  ...value,
}));

// "3일 전 확인" 처럼 신선도를 항상 함께 보여준다 — 낡은 정보로 신뢰를 깎지 않기 위해
export function hazardFreshness(lastConfirmedAt: string, staleness: number): string {
  const days = Math.floor((Date.now() - new Date(lastConfirmedAt).getTime()) / 86_400_000);
  const when =
    days <= 0 ? '오늘' : days === 1 ? '어제' : days < 30 ? `${days}일 전` : `${Math.floor(days / 30)}개월 전`;
  return staleness > 0 ? `${when} 확인 · 오래된 정보` : `${when} 확인`;
}
