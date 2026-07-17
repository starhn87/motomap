import { View, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(임시 목적지) 핀 — 물방울 실루엣 전체를 흰 테두리가 감싼다.
// 테두리는 "흰 물방울 위에 조금 작은 색 물방울 겹치기"로 만든다 (삼각 꼬리에는
// border 를 줄 수 없어서). 마커 children 은 정적 비트맵 캡처라 이모지·폰트가
// 유실되고(실측), 자식 View 도 플래트닝으로 빠질 수 있어 전부 collapsable={false}.
const PIN = '#475569';
const WRAP_W = 38;
const WRAP_H = 47;

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
        {/* 흰 물방울 (테두리 역할) */}
        <View collapsable={false} style={styles.layer}>
          <View collapsable={false} style={styles.headWhite} />
          <View collapsable={false} style={styles.tailWhite} />
        </View>
        {/* 색 물방울 (본체) */}
        <View collapsable={false} style={[styles.layer, styles.colorLayer]}>
          <View collapsable={false} style={styles.headColor}>
            <View collapsable={false} style={styles.flagRow}>
              <View collapsable={false} style={styles.flagPole} />
              <View collapsable={false} style={styles.flagFace} />
            </View>
          </View>
          <View collapsable={false} style={styles.tailColor} />
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: WRAP_W,
    height: WRAP_H,
  },
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
  },
  colorLayer: {
    top: 2,
  },
  headWhite: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  tailWhite: {
    width: 0,
    height: 0,
    marginTop: -4,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 17,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  headColor: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tailColor: {
    width: 0,
    height: 0,
    marginTop: -4,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flagPole: {
    width: 2,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  flagFace: {
    width: 7,
    height: 6,
    marginTop: 1,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
});
