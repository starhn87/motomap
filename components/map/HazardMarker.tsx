import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import {
  HAZARD_MARKER_GLOBAL_Z_INDEX,
  HAZARD_MIN_ZOOM,
} from '@/constants/hazards';
import { HAZARD_MARKER_IMAGES } from '@/constants/markerImages';
import type { RoadHazard } from '@/types';

// 노면 위험 마커 — 장소(물방울)와 확실히 구분되도록 삼각 경고 형태로 그린다.
// 정적 이미지로 그려 windowing 중 children 캡처의 고아 뷰 잔상을 피한다.
// 수명을 넘긴(staleness=1) 제보는 흐리게 띄워 "오래된 정보"임을 알린다.
export default function HazardMarker({
  hazard,
  onTap,
}: {
  hazard: RoadHazard;
  onTap?: () => void;
}) {
  return (
    <NaverMapMarkerOverlay
      latitude={hazard.latitude}
      longitude={hazard.longitude}
      anchor={{ x: 0.5, y: 0.5 }}
      width={34}
      height={34}
      image={HAZARD_MARKER_IMAGES[hazard.type]}
      alpha={hazard.staleness > 0 ? 0.5 : 1}
      minZoom={HAZARD_MIN_ZOOM}
      globalZIndex={HAZARD_MARKER_GLOBAL_Z_INDEX}
      zIndex={80}
      isForceShowIcon
      isHideCollidedSymbols
      onTap={onTap}
    />
  );
}
