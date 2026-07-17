import { View, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(임시 목적지) 핀 — 카테고리 마커(PNG)와 구분되는 중립 슬레이트 색.
// 마커 children 은 정적 비트맵으로 캡처되므로 순수 View 도형으로만 그린다.
const PIN = '#475569';
const SIZE = 34;

export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={SIZE}
      height={SIZE + 10}
      zIndex={2000}>
      <View collapsable={false} style={styles.wrap}>
        <View style={styles.head}>
          <View style={styles.dot} />
        </View>
        <View style={styles.tail} />
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE + 10,
    alignItems: 'center',
  },
  head: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: PIN,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN,
  },
});
