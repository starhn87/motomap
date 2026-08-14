-- camping(캠핑) 카테고리를 places_category_check 제약에 추가한다.
-- 모토캠핑 장소 등록을 위해 앱 타입(PlaceCategory)과 함께 확장.

alter table places drop constraint if exists places_category_check;

alter table places add constraint places_category_check
  check (category in (
    'cafe',
    'restaurant',
    'rest_stop',
    'gas_station',
    'repair_shop',
    'viewpoint',
    'gear_shop',
    'camping'
  ));
