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
  car_wash: require('@/assets/images/markers/car_wash.png'),
};

// 즐겨찾기 표시 켠 상태의 마커 — 같은 핀에서 카테고리 아이콘 대신 노란 별
// (네이버 지도식). 뷰박스·렌더 크기는 기본 마커와 동일하다.
export const MARKER_IMAGES_FAV: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe_fav.png'),
  restaurant: require('@/assets/images/markers/restaurant_fav.png'),
  rest_stop: require('@/assets/images/markers/rest_stop_fav.png'),
  gas_station: require('@/assets/images/markers/gas_station_fav.png'),
  repair_shop: require('@/assets/images/markers/repair_shop_fav.png'),
  viewpoint: require('@/assets/images/markers/viewpoint_fav.png'),
  gear_shop: require('@/assets/images/markers/gear_shop_fav.png'),
  camping: require('@/assets/images/markers/camping_fav.png'),
  car_wash: require('@/assets/images/markers/car_wash_fav.png'),
};
