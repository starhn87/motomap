import { View, Text, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { HAZARDS } from '@/constants/hazards';
import type { RoadHazard } from '@/types';

// 노면 위험 마커 — 장소(물방울)와 확실히 구분되도록 삼각 경고 형태로 그린다.
// 마커 children 은 정적 비트맵으로 한 번 캡처되므로 폰트 아이콘 대신 순수 View.
// 수명을 넘긴(staleness=1) 제보는 흐리게 띄워 "오래된 정보"임을 형태로도 알린다.
export default function HazardMarker({ hazard }: { hazard: RoadHazard }) {
  const color = HAZARDS[hazard.type].color;

  return (
    <NaverMapMarkerOverlay
      latitude={hazard.latitude}
      longitude={hazard.longitude}
      anchor={{ x: 0.5, y: 0.5 }}
      width={34}
      height={34}
      zIndex={80}>
      <View collapsable={false} style={styles.canvas}>
        <View
          style={[
            styles.triangle,
            { borderBottomColor: '#FFFFFF', opacity: hazard.staleness > 0 ? 0.5 : 1 },
          ]}
        />
        <View
          style={[
            styles.triangleInner,
            { borderBottomColor: color, opacity: hazard.staleness > 0 ? 0.5 : 1 },
          ]}
        />
        <Text style={[styles.bang, { opacity: hazard.staleness > 0 ? 0.5 : 1 }]}>!</Text>
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 34, height: 34 },
  triangle: {
    position: 'absolute',
    top: 2,
    left: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 29,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  triangleInner: {
    position: 'absolute',
    top: 6,
    left: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderBottomWidth: 23,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  bang: {
    position: 'absolute',
    top: 13,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
