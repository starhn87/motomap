import { View, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(임시 목적지) 핀 — 갸름한 물방울(원형 헤드 + 좁고 긴 꼬리) 실루엣.
// 마커 children 은 정적 비트맵으로 캡처되어 이모지·폰트 아이콘이 유실될 수 있으므로
// 깃발까지 순수 View 도형으로만 그린다 (실측: 🚩 이모지가 캡처에서 빠졌다).
const PIN = '#475569';
const HEAD = 26; // 헤드 지름
const WRAP_W = 32;
const WRAP_H = 42;

export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={WRAP_W}
      height={WRAP_H}
      zIndex={2000}>
      <View collapsable={false} style={styles.wrap}>
        <View style={styles.head}>
          {/* 도형 깃발: 깃대 + 사각 깃면 */}
          <View style={styles.flagRow}>
            <View style={styles.flagPole} />
            <View style={styles.flagFace} />
          </View>
        </View>
        <View style={styles.tail} />
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: WRAP_W,
    height: WRAP_H,
    alignItems: 'center',
  },
  head: {
    width: HEAD,
    height: HEAD,
    borderRadius: HEAD / 2,
    backgroundColor: PIN,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flagPole: {
    width: 1.5,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  flagFace: {
    width: 7,
    height: 5.5,
    marginTop: 0.5,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN,
  },
});
