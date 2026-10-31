import { memo } from 'react';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { MARKER_IMAGES_CIRCLE } from '@/constants/markerImages';
import type { Place } from '@/types';

// 네이버 기본 심벌(-100,000~100,000)보다 위, 내 위치(300,000)보다 아래다.
// 등록 장소 아이콘은 줌별 충돌 재판정에서도 숨지 않고 네이티브 POI를 가린다.
export const PLACE_MARKER_GLOBAL_Z_INDEX = 200_000;
export const TEMPORARILY_CLOSED_MARKER_ALPHA = 0.52;

export function markerCaption(name: string, temporarilyClosed: boolean): string {
  return temporarilyClosed ? `임시 휴업 · ${name}` : name;
}

const RegisteredPlaceMarkers = memo(function RegisteredPlaceMarkers({
  places,
  selectedPlaceId,
  operationalStatuses,
  dark,
  onTap,
}: {
  places: Place[];
  selectedPlaceId: string | null;
  operationalStatuses: Record<string, string>;
  dark: boolean;
  onTap: (place: Place) => void;
}) {
  return places
    .filter((place) => place.id !== selectedPlaceId)
    .map((place) => {
      const temporarilyClosed = operationalStatuses[place.id] === 'temporarily_closed';
      return (
        <NaverMapMarkerOverlay
          key={place.id}
          latitude={place.latitude}
          longitude={place.longitude}
          image={MARKER_IMAGES_CIRCLE[place.category]}
          width={30}
          height={30}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={temporarilyClosed ? TEMPORARILY_CLOSED_MARKER_ALPHA : 1}
          globalZIndex={PLACE_MARKER_GLOBAL_Z_INDEX}
          zIndex={10}
          isForceShowIcon
          isHideCollidedSymbols
          isHideCollidedCaptions
          caption={{
            text: markerCaption(place.name, temporarilyClosed),
            textSize: 12,
            minZoom: 8,
            color: dark ? '#F9FAFB' : '#111827',
            haloColor: dark ? '#111827' : '#FFFFFF',
          }}
          onTap={() => onTap(place)}
        />
      );
    });
});

export default RegisteredPlaceMarkers;
