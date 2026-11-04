import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/AppText';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { BRAND_BADGES, type GasStation } from '@/lib/api/gasStations';

interface Props {
  station: GasStation;
  isCheapest: boolean;
  isSelected: boolean;
  /** 가격순 순위(0=최저) — 겹침 시 싼 마커가 살아남도록 zIndex 에 반영 */
  rank: number;
  onTap: (station: GasStation) => void;
}

// 캡슐 자연 폭이 얼마든 잘리지 않도록 마커 캔버스를 넉넉히 잡는다 (여백은 투명으로 캡처됨)
const HEIGHT = 40;
// 선택 마커는 캡슐을 키우고 그림자가 잘리지 않을 여백을 더 둔다
const SELECTED_HEIGHT = 58;

// 유가 라벨 마커 — [브랜드 칩][가격] 캡슐. 선택하면 색은 그대로 두고 크기와 그림자만 키운다(MAP-058). 꼬리 삼각형은 두지 않는다(MAP-059). children 은 정적 비트맵으로 한 번 캡처되므로
// 순수 View/Text 로만 그리고, 표시 내용(가격·최저·선택)이 바뀌면 상위에서 key 를 바꿔 재캡처시킨다.
// 클러스터링 대신 SDK 의 겹침 숨김을 쓴다 — 겹치면 비싼 마커부터 숨고 최저가는 항상 표시.
export default function GasStationMarker({ station, isCheapest, isSelected, rank, onTap }: Props) {
  const badge = BRAND_BADGES[station.brand];
  const width = (isCheapest ? 150 : 120) + (isSelected ? 40 : 0);
  const height = isSelected ? SELECTED_HEIGHT : HEIGHT;

  return (
    <NaverMapMarkerOverlay
      latitude={station.latitude}
      longitude={station.longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={width}
      height={height}
      zIndex={isSelected ? 2000 : 1000 - rank}
      isHideCollidedMarkers
      isForceShowIcon={isCheapest || isSelected}
      onTap={() => onTap(station)}>
      <View collapsable={false} style={[styles.wrap, { width, height }]}>
        {/* 그림자는 overflow:hidden 캡슐 바깥 래퍼에 둬야 잘리지 않는다 */}
        <View style={[styles.capsuleShadow, isSelected && styles.capsuleShadowSelected]}>
        <View style={styles.capsule}>
          {badge && (
            <View style={[styles.brandChip, isSelected && styles.brandChipSelected, { backgroundColor: badge.color }]}>
              <Text numberOfLines={1} style={[styles.brandText, isSelected && styles.brandTextSelected, badge.textColor ? { color: badge.textColor } : null]}>
                {badge.label}
              </Text>
            </View>
          )}
          <View style={[styles.priceChip, isCheapest && styles.priceChipCheapest, isSelected && styles.priceChipSelected]}>
            <Text numberOfLines={1} style={[styles.price, isSelected && styles.priceSelected]}>
              {isCheapest ? '최저 ' : ''}
              {station.price.toLocaleString()}
            </Text>
          </View>
        </View>
        </View>
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
  capsuleShadow: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  capsuleShadowSelected: {
    // 꼬리가 없으니 아래 그림자가 비트맵 밖으로 잘리지 않게 바닥 여백을 둔다
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  brandChip: {
    paddingLeft: 9,
    paddingRight: 7,
    justifyContent: 'center',
  },
  brandChipSelected: {
    paddingLeft: 11,
    paddingRight: 9,
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  brandTextSelected: {
    fontSize: 13,
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
  priceChipSelected: {
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  priceSelected: {
    fontSize: 16,
  },
  price: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
