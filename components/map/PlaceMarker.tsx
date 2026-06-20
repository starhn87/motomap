import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import type { Place, PlaceCategory } from '@/types';

const MARKER_IMAGES: Record<PlaceCategory, any> = {
  cafe: require('@/assets/images/markers/cafe.png'),
  restaurant: require('@/assets/images/markers/restaurant.png'),
  rest_stop: require('@/assets/images/markers/rest_stop.png'),
  gas_station: require('@/assets/images/markers/gas_station.png'),
  repair_shop: require('@/assets/images/markers/repair_shop.png'),
  viewpoint: require('@/assets/images/markers/viewpoint.png'),
  // 용품점 전용 마커 전까지 임시로 바이크사(정비소) 마커 재사용
  gear_shop: require('@/assets/images/markers/repair_shop.png'),
};

interface Props {
  place: Place;
  isSelected: boolean;
  onPress: () => void;
}

export default function PlaceMarker({ place, isSelected, onPress }: Props) {
  const markerImage = MARKER_IMAGES[place.category];

  return (
    <NaverMapMarkerOverlay
      latitude={place.latitude}
      longitude={place.longitude}
      onTap={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      width={isSelected ? 52 : 40}
      height={isSelected ? 52 : 40}
      image={markerImage}
    />
  );
}
