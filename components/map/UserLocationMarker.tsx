import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

/**
 * 내 위치 마커: 파란 점 + 흰 테두리, 옅은 halo, heading 방향 정삼각형 화살표.
 *
 * children(뷰 캡처)이 아니라 정적 이미지로 그린다 — 캡처 마커는 캡처용 네이티브
 * 뷰가 고아로 남아 화면을 떠도는 잔상 버그가 있고(CLAUDE.md), 위치 마커는 위치
 * 갱신마다 다시 그려져 가장 잘 걸린다(실기기에서 길안내 화면 위 잔상으로 확인).
 * 이미지 생성: node scripts/generate-markers.mjs
 */
export function UserLocationMarker({
  latitude,
  longitude,
  heading,
}: {
  latitude: number;
  longitude: number;
  heading: number;
}) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      anchor={{ x: 0.5, y: 0.5 }}
      width={80}
      height={80}
      angle={heading}
      isFlatEnabled
      image={require('@/assets/images/markers/user_location.png')}
    />
  );
}
