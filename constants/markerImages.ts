import type { HazardType, PlaceCategory } from '@/types';

// 카테고리별 핀 이미지 — 선택 강조와 경로 미리보기 등에 사용한다.
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
// 선택됐을 때의 핀. 등록 장소와 같은 규칙 — 원형은 미선택, 핀은 선택.
export const GENERAL_MARKER_FAV = require('@/assets/images/markers/general_fav.png');

// 위험 마커도 children 캡처 대신 정적 이미지를 쓴다. windowing으로 마운트가
// 반복될 때 캡처용 네이티브 뷰가 고아로 남는 잔상을 방지한다.
export const HAZARD_MARKER_IMAGES: Record<HazardType, any> = {
  sand: require('@/assets/images/markers/hazard_sand.png'),
  oil: require('@/assets/images/markers/hazard_oil.png'),
  pothole: require('@/assets/images/markers/hazard_pothole.png'),
  rockfall: require('@/assets/images/markers/hazard_rockfall.png'),
  ice: require('@/assets/images/markers/hazard_ice.png'),
  construction: require('@/assets/images/markers/hazard_construction.png'),
  etc: require('@/assets/images/markers/hazard_etc.png'),
};

// 경유지 순번 마커 — 출발 도트와 같은 파랑 계열에 번호(navi 의 MAX_USER_VIAS = 3).
// 4번째부터는 마지막 이미지를 재사용한다(경유지 상한이 늘어나도 깨지지 않게).
export const VIA_MARKERS = [
  require('@/assets/images/markers/via_1.png'),
  require('@/assets/images/markers/via_2.png'),
  require('@/assets/images/markers/via_3.png'),
];
