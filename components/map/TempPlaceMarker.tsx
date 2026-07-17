import { View, Text, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(임시 목적지) 핀 — 물방울 모양, 카테고리 마커(PNG)와 구분되는 중립 슬레이트 색.
// 물방울은 "모서리 셋만 둥근 사각형을 45도 회전"으로 그린다. 마커 children 은 정적
// 비트맵으로 캡처되므로 순수 View 도형 + 이모지 Text 만 사용한다 (벡터 아이콘 폰트 금지).
const PIN = '#475569';
const HEAD = 34; // 회전 전 사각형 한 변
const WRAP = 48; // 회전 대각선을 감싸는 캔버스 (뾰족 끝이 바닥 중앙에 온다)

export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={WRAP}
      height={WRAP}
      zIndex={2000}>
      <View collapsable={false} style={styles.wrap}>
        <View style={styles.drop}>
          <View style={styles.inner}>
            <Text style={styles.emoji}>🚩</Text>
          </View>
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: WRAP,
    height: WRAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drop: {
    width: HEAD,
    height: HEAD,
    backgroundColor: PIN,
    borderTopLeftRadius: HEAD / 2,
    borderTopRightRadius: HEAD / 2,
    borderBottomLeftRadius: HEAD / 2,
    borderBottomRightRadius: 4,
    transform: [{ rotate: '45deg' }],
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  inner: {
    width: HEAD - 12,
    height: HEAD - 12,
    borderRadius: (HEAD - 12) / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  emoji: {
    fontSize: 13,
  },
});
