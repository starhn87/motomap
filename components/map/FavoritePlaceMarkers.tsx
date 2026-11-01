import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { MARKER_IMAGES_CIRCLE_FAV, GENERAL_MARKER_CIRCLE_FAV } from '@/constants/markerImages';
import {
  PLACE_MARKER_GLOBAL_Z_INDEX,
  TEMPORARILY_CLOSED_MARKER_ALPHA,
  markerCaption,
} from '@/components/map/RegisteredPlaceMarkers';
import type { GeneralFavorite } from '@/lib/api/favorites';
import type { Place } from '@/types';

// 즐겨찾기(등록·일반) 원형 마커. 메인 지도와 지도에서 선택이 같은 모양·캡션을 쓴다.
// 고른 마커는 각 화면이 핀으로 다시 그리므로 여기서는 뺀다(원형 위에 핀이 겹치지 않게).
export default function FavoritePlaceMarkers({
  places,
  general,
  selectedPlaceId,
  selectedGeneralId,
  operationalStatuses,
  dark,
  onTapPlace,
  onTapGeneral,
}: {
  places: Place[];
  general: GeneralFavorite[];
  selectedPlaceId: string | null;
  selectedGeneralId: string | null;
  operationalStatuses: Record<string, string>;
  dark: boolean;
  onTapPlace: (place: Place) => void;
  onTapGeneral: (place: GeneralFavorite) => void;
}) {
  const caption = {
    textSize: 13,
    minZoom: 8,
    color: dark ? '#F9FAFB' : '#111827',
    haloColor: dark ? '#111827' : '#FFFFFF',
  };
  return (
    <>
      {/* 즐겨찾기는 높은 우선순위로 겹친 일반 마커보다 먼저 보인다. */}
      {places
        .filter((place) => place.id !== selectedPlaceId)
        .map((place) => {
          const temporarilyClosed = operationalStatuses[place.id] === 'temporarily_closed';
          return (
            <NaverMapMarkerOverlay
              key={place.id}
              latitude={place.latitude}
              longitude={place.longitude}
              image={MARKER_IMAGES_CIRCLE_FAV[place.category]}
              width={30}
              height={30}
              anchor={{ x: 0.5, y: 0.5 }}
              alpha={temporarilyClosed ? TEMPORARILY_CLOSED_MARKER_ALPHA : 1}
              globalZIndex={PLACE_MARKER_GLOBAL_Z_INDEX}
              zIndex={50}
              isForceShowIcon
              isHideCollidedSymbols
              isHideCollidedCaptions
              caption={{ ...caption, text: markerCaption(place.name, temporarilyClosed) }}
              onTap={() => onTapPlace(place)}
            />
          );
        })}
      {/* 등록되지 않은 일반 장소 즐겨찾기 — 카테고리가 없어 색으로 구분되지
          않는다(중립 회색 + 별). 탭하면 등록 장소 대신 임시 카드가 뜬다. */}
      {general
        .filter((place) => place.id !== selectedGeneralId)
        .map((place) => (
          <NaverMapMarkerOverlay
            key={`fav-general-${place.id}`}
            latitude={place.latitude}
            longitude={place.longitude}
            image={GENERAL_MARKER_CIRCLE_FAV}
            width={30}
            height={30}
            anchor={{ x: 0.5, y: 0.5 }}
            globalZIndex={PLACE_MARKER_GLOBAL_Z_INDEX}
            zIndex={50}
            isForceShowIcon
            isHideCollidedSymbols
            isHideCollidedCaptions
            caption={{ ...caption, text: place.name }}
            onTap={() => onTapGeneral(place)}
          />
        ))}
    </>
  );
}
