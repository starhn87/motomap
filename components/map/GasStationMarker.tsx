import { View, Text, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import type { GasStation } from '@/lib/api/gasStations';

interface Props {
  station: GasStation;
  isCheapest: boolean;
  onTap: (station: GasStation) => void;
}

// 유가 라벨 마커 — children 은 정적 비트맵으로 캡처되므로 순수 View/Text 로만 그린다.
// 가격이 바뀌면 key 를 바꿔 재캡처되도록 상위에서 key={id + price} 로 렌더할 것.
export default function GasStationMarker({ station, isCheapest, onTap }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={station.latitude}
      longitude={station.longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={station.price >= 10000 ? 84 : 72}
      height={38}
      onTap={() => onTap(station)}>
      <View collapsable={false} style={styles.wrap}>
        <View style={[styles.capsule, isCheapest && styles.cheapest]}>
          <Text style={styles.price}>
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
