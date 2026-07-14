import { View, Text, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import type { GasStation } from '@/lib/api/gasStations';

interface Props {
  station: GasStation;
  isCheapest: boolean;
  onTap: (station: GasStation) => void;
}

const HEIGHT = 40;

// 유가 라벨 마커 — children 은 정적 비트맵으로 한 번 캡처되므로 순수 View/Text 로만 그리고,
// 표시 내용(가격·최저 여부)이 바뀌면 상위에서 key 를 바꿔 재캡처시킨다.
export default function GasStationMarker({ station, isCheapest, onTap }: Props) {
  // "최저 " 접두가 붙으면 캡슐이 길어진다 — 내부 자연 폭이 마커 폭을 넘으면 잘리므로 함께 계산
  const width = isCheapest ? 104 : 76;

  return (
    <NaverMapMarkerOverlay
      latitude={station.latitude}
      longitude={station.longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={width}
      height={HEIGHT}
      onTap={() => onTap(station)}>
      <View collapsable={false} style={[styles.wrap, { width, height: HEIGHT }]}>
        <View style={[styles.capsule, isCheapest && styles.cheapest]}>
          <Text numberOfLines={1} style={styles.price}>
            {isCheapest ? '최저 ' : ''}
            {station.price.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.pointer, isCheapest && styles.pointerCheapest]} />
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  capsule: {
    backgroundColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cheapest: {
    backgroundColor: '#16A34A',
  },
  price: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1F2937',
  },
  pointerCheapest: {
    borderTopColor: '#16A34A',
  },
});
