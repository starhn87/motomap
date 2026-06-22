import { View, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

// 네이버 블루 기반 고정 색상 (테마 tint와 무관)
const USER_LOCATION_BLUE = '#2D8CFF';
const USER_LOCATION_HALO = 'rgba(45, 140, 255, 0.18)';

/**
 * 내 위치 마커: 파란 점 + 흰 테두리, 옅은 halo, heading 방향 정삼각형 화살표.
 * 마커는 정적 비트맵으로 캡처되므로 순수 View로 그린다(폰트 아이콘 캡처 타이밍 회피).
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
      isFlatEnabled>
      <View collapsable={false} style={styles.container}>
        <View style={styles.halo} />
        <View style={styles.arrowOutline} />
        <View style={styles.arrowInner} />
        <View style={styles.dot} />
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
  },
  halo: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: USER_LOCATION_HALO,
  },
  arrowOutline: {
    position: 'absolute',
    top: 18,
    left: 33,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  arrowInner: {
    position: 'absolute',
    top: 21,
    left: 36,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: USER_LOCATION_BLUE,
  },
  dot: {
    position: 'absolute',
    top: 31,
    left: 31,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: USER_LOCATION_BLUE,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
