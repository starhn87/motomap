import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { GENERAL_MARKER_CIRCLE } from '@/constants/markerImages';

interface Props {
  latitude: number;
  longitude: number;
  /** 선택 전 상태 — 원형(지름 30, 중앙 앵커). 핀은 선택된 마커에만 쓴다. */
  circle?: boolean;
  onTap?: () => void;
}

// 일반 장소(검색·지도 탭) 임시 마커 — 카테고리 마커와 같은 스타일의 중립색.
// 선택된 장소는 물방울 핀(하단 앵커라 꼬리 끝이 좌표), 그 외에는 원형.
export default function TempPlaceMarker({ latitude, longitude, circle, onTap }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      onTap={onTap}
      image={circle ? GENERAL_MARKER_CIRCLE : require('@/assets/images/markers/general.png')}
      width={circle ? 30 : 32}
      height={circle ? 30 : 37}
      anchor={circle ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }}
      zIndex={90}
    />
  );
}
