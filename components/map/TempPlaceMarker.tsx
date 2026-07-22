import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(검색·지도 탭) 임시 핀 — 카테고리 마커와 같은 물방울 스타일의 중립색
// 이미지. 하단 앵커라 꼬리 끝이 좌표를 찍는다.
export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      image={require('@/assets/images/markers/general.png')}
      width={36}
      height={50}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={90}
    />
  );
}
