import { View, Text, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { BRAND_BADGES, type GasStation } from '@/lib/api/gasStations';

interface Props {
  station: GasStation;
  isCheapest: boolean;
  /** 가격순 순위(0=최저) — 겹침 시 싼 마커가 살아남도록 zIndex 에 반영 */
  rank: number;
  onTap: (station: GasStation) => void;
}

// 캡슐 자연 폭이 얼마든 잘리지 않도록 마커 캔버스를 넉넉히 잡는다 (여백은 투명으로 캡처됨)
const HEIGHT = 40;

// 유가 라벨 마커 — [브랜드 칩][가격] 캡슐. children 은 정적 비트맵으로 한 번 캡처되므로
// 순수 View/Text 로만 그리고, 표시 내용(가격·최저)이 바뀌면 상위에서 key 를 바꿔 재캡처시킨다.
// 클러스터링 대신 SDK 의 겹침 숨김을 쓴다 — 겹치면 비싼 마커부터 숨고 최저가는 항상 표시.
export default function GasStationMarker({ station, isCheapest, rank, onTap }: Props) {
  const badge = BRAND_BADGES[station.brand];
  const width = isCheapest ? 150 : 120;

  return (
    <NaverMapMarkerOverlay
      latitude={station.latitude}
      longitude={station.longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={width}
      height={HEIGHT}
      zIndex={1000 - rank}
      isHideCollidedMarkers
      isForceShowIcon={isCheapest}
      onTap={() => onTap(station)}>
      <View collapsable={false} style={[styles.wrap, { width, height: HEIGHT }]}>
        <View style={styles.capsule}>
          {badge && (
            <View style={[styles.brandChip, { backgroundColor: badge.color }]}>
              <Text numberOfLines={1} style={[styles.brandText, badge.textColor ? { color: badge.textColor } : null]}>
                {badge.label}
              </Text>
            </View>
          )}
          <View style={[styles.priceChip, isCheapest && styles.priceChipCheapest]}>
            <Text numberOfLines={1} style={styles.price}>
              {isCheapest ? '최저 ' : ''}
              {station.price.toLocaleString()}
            </Text>
          </View>
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
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  brandChip: {
    paddingLeft: 9,
    paddingRight: 7,
    justifyContent: 'center',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  priceChip: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  priceChipCheapest: {
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
