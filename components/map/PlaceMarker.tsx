import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import type { Place } from '@/types';
import { MARKER_IMAGES } from '@/constants/markerImages';

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
