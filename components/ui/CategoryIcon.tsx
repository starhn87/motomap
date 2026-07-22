import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { CATEGORIES } from '@/constants/categories';
import type { PlaceCategory } from '@/types';

// 카테고리 벡터 심벌 — 지도 마커(generate-markers.mjs)와 같은 Material 글리프를
// 쓴다. 이모지는 크기가 작아지면 뭉개지고 플랫폼마다 생김새가 달라 UI 전반에서
// 벡터로 통일한다.
const GLYPHS: Record<PlaceCategory, { set: 'mi' | 'mci'; name: string }> = {
  cafe: { set: 'mi', name: 'local-cafe' },
  restaurant: { set: 'mi', name: 'restaurant' },
  rest_stop: { set: 'mi', name: 'local-parking' },
  gas_station: { set: 'mi', name: 'local-gas-station' },
  repair_shop: { set: 'mi', name: 'build' },
  viewpoint: { set: 'mi', name: 'photo-camera' },
  gear_shop: { set: 'mi', name: 'shopping-bag' },
  camping: { set: 'mci', name: 'tent' },
};

interface Props {
  category: PlaceCategory;
  size?: number;
  /** 미지정 시 카테고리 색 */
  color?: string;
}

export default function CategoryIcon({ category, size = 18, color }: Props) {
  const glyph = GLYPHS[category];
  const tint = color ?? CATEGORIES[category].color;
  if (glyph.set === 'mci') {
    return <MaterialCommunityIcons name={glyph.name as any} size={size} color={tint} />;
  }
  return <MaterialIcons name={glyph.name as any} size={size} color={tint} />;
}
