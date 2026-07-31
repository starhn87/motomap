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

// 즐겨찾기 표시 켠 상태의 마커 — 같은 핀에 우상단 노란 별 뱃지.
// 뷰박스가 별만큼 넓어(48x60) 렌더 크기도 그 비율로 키워 그린다.
export const MARKER_IMAGES_FAV: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe_fav.png'),
  restaurant: require('@/assets/images/markers/restaurant_fav.png'),
  rest_stop: require('@/assets/images/markers/rest_stop_fav.png'),
  gas_station: require('@/assets/images/markers/gas_station_fav.png'),
  repair_shop: require('@/assets/images/markers/repair_shop_fav.png'),
  viewpoint: require('@/assets/images/markers/viewpoint_fav.png'),
  gear_shop: require('@/assets/images/markers/gear_shop_fav.png'),
  camping: require('@/assets/images/markers/camping_fav.png'),
};
