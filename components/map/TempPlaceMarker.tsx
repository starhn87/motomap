import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(검색·지도 탭) 임시 핀 — 카테고리 마커와 같은 물방울 스타일의 중립색
// 이미지. 캔버스 하반부는 투명 여백이라 중앙 앵커에서 꼬리가 좌표를 찍는다.
export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      image={require('@/assets/images/markers/general.png')}
      width={40}
      height={112}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={90}
    />
  );
}
