-- gear_shop(용품점) 카테고리를 places_category_check 제약에 추가한다.
-- 앱 타입(PlaceCategory)에는 정의돼 있었으나 DB 제약에 누락되어 있어
-- gear_shop INSERT가 places_category_check 위반(23514)으로 실패했다.

alter table places drop constraint if exists places_category_check;

alter table places add constraint places_category_check
  check (category in (
    'cafe',
    'restaurant',
    'rest_stop',
    'gas_station',
    'repair_shop',
    'viewpoint',
    'gear_shop'
  ));
