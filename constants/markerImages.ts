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

// 선택되지 않은 마커의 기본형 — 원형(지름 30, 앵커 중앙). 핀보다 자리를 덜
// 차지해 마커가 몰려도 덜 답답하다. 핀은 "선택된 것" 하나만 쓴다.
export const MARKER_IMAGES_CIRCLE: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe_circle.png'),
  restaurant: require('@/assets/images/markers/restaurant_circle.png'),
  rest_stop: require('@/assets/images/markers/rest_stop_circle.png'),
  gas_station: require('@/assets/images/markers/gas_station_circle.png'),
  repair_shop: require('@/assets/images/markers/repair_shop_circle.png'),
  viewpoint: require('@/assets/images/markers/viewpoint_circle.png'),
  gear_shop: require('@/assets/images/markers/gear_shop_circle.png'),
  camping: require('@/assets/images/markers/camping_circle.png'),
  car_wash: require('@/assets/images/markers/car_wash_circle.png'),
};

export const MARKER_IMAGES_CIRCLE_FAV: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe_circle_fav.png'),
  restaurant: require('@/assets/images/markers/restaurant_circle_fav.png'),
  rest_stop: require('@/assets/images/markers/rest_stop_circle_fav.png'),
  gas_station: require('@/assets/images/markers/gas_station_circle_fav.png'),
  repair_shop: require('@/assets/images/markers/repair_shop_circle_fav.png'),
  viewpoint: require('@/assets/images/markers/viewpoint_circle_fav.png'),
  gear_shop: require('@/assets/images/markers/gear_shop_circle_fav.png'),
  camping: require('@/assets/images/markers/camping_circle_fav.png'),
  car_wash: require('@/assets/images/markers/car_wash_circle_fav.png'),
};

// 일반 장소(카카오 임시 핀)의 원형 — 검색 결과 지도에서 선택 전 상태
export const GENERAL_MARKER_CIRCLE = require('@/assets/images/markers/general_circle.png');
// 등록되지 않은 곳도 즐겨찾기할 수 있다 — 색은 중립 그대로라 라이더 장소와 구분된다
export const GENERAL_MARKER_CIRCLE_FAV = require('@/assets/images/markers/general_circle_fav.png');
