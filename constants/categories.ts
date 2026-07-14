import type { PlaceCategory } from '@/types';

interface CategoryInfo {
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: Record<PlaceCategory, CategoryInfo> = {
  cafe: { label: '카페', icon: '☕', color: '#A16207' },
  restaurant: { label: '맛집', icon: '🍽️', color: '#EF4444' },
  rest_stop: { label: '휴게소', icon: '🅿️', color: '#3B82F6' },
  gas_station: { label: '주유소', icon: '⛽', color: '#22C55E' },
  repair_shop: { label: '바이크사', icon: '🏍️', color: '#8B5CF6' },
  viewpoint: { label: '뷰포인트', icon: '📸', color: '#EC4899' },
  gear_shop: { label: '용품점', icon: '🧤', color: '#0EA5E9' },
  camping: { label: '캠핑', icon: '⛺', color: '#F97316' },
};

export const CATEGORY_LIST = Object.entries(CATEGORIES).map(
  ([key, value]) => ({
    key: key as PlaceCategory,
    ...value,
  })
);
