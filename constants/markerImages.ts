import type { PlaceCategory } from '@/types';

// 카테고리별 지도 마커 이미지 (지도 마커/클러스터 공용)
export const MARKER_IMAGES: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe.png'),
  restaurant: require('@/assets/images/markers/restaurant.png'),
  rest_stop: require('@/assets/images/markers/rest_stop.png'),
  gas_station: require('@/assets/images/markers/gas_station.png'),
  repair_shop: require('@/assets/images/markers/repair_shop.png'),
  viewpoint: require('@/assets/images/markers/viewpoint.png'),
  gear_shop: require('@/assets/images/markers/gear_shop.png'),
  camping: require('@/assets/images/markers/camping.png'),
};
