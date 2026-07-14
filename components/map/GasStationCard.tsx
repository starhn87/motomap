import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useGasStationDetail } from '@/hooks/useGasStations';
import { openNavigation } from '@/lib/navigation';
import { FUEL_LABELS, type GasStation } from '@/lib/api/gasStations';

interface Props {
  station: GasStation;
  onClose: () => void;
}

// 상세의 TRADE_DT/TM("20260714 175951") → "07.14 17:59 기준"
function formatTradeAt(tradeAt: string): string {
  const m = tradeAt.match(/^\d{4}(\d{2})(\d{2})\s+(\d{2})(\d{2})/);
  return m ? `${m[1]}.${m[2]} ${m[3]}:${m[4]} 기준` : '';
}

export default function GasStationCard({ station, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: detail, isLoading } = useGasStationDetail(station.id);

  const prices = detail?.prices ?? [];
  const tradeAt = prices[0] ? formatTradeAt(prices[0].tradeAt) : '';

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {station.name}
          </Text>
          <View style={styles.badgeRow}>
            {!!station.brand && (
              <Text style={[styles.badge, { color: colors.textSecondary, borderColor: colors.border }]}>
                {station.brand}
              </Text>
            )}
            {station.isSelf && (
              <Text style={[styles.badge, { color: colors.textSecondary, borderColor: colors.border }]}>
                셀프
              </Text>
            )}
            {prices.some((p) => p.prod === 'B034') && (
              <Text style={[styles.badge, styles.premiumBadge]}>고급유</Text>
            )}
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>✕</Text>
        </Pressable>
      </View>

      {/* 상세 로딩 중에도 3줄 높이를 예약해 카드가 늘어나며 밀리지 않게 한다 */}
      <View style={styles.priceRows}>
        {isLoading
          ? [0, 1, 2].map((i) => (
              <View key={i} style={styles.priceRow}>
                <View style={[styles.skeleton, { width: 64, backgroundColor: colors.surfaceMuted }]} />
                <View style={[styles.skeleton, { width: 88, backgroundColor: colors.surfaceMuted }]} />
              </View>
            ))
          : (prices.length > 0
              ? prices.filter((p) => p.prod in FUEL_LABELS)
              : [{ prod: 'B027', price: station.price, tradeAt: '' }]
            ).map((p) => (
              <View key={p.prod} style={styles.priceRow}>
                <Text style={[styles.fuelLabel, { color: colors.textSecondary }]}>
                  {FUEL_LABELS[p.prod as keyof typeof FUEL_LABELS] ?? p.prod}
                </Text>
                <Text style={[styles.fuelPrice, { color: colors.text }]}>
                  {p.price.toLocaleString()}원
                </Text>
              </View>
            ))}
      </View>

      <View style={styles.footer}>
        {isLoading ? (
          <View style={[styles.skeleton, styles.metaSkeleton, { backgroundColor: colors.surfaceMuted }]} />
        ) : (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {[detail?.address, tradeAt].filter(Boolean).join(' · ')}
          </Text>
        )}
        <Pressable
          onPress={() =>
            openNavigation({
              name: station.name,
              latitude: station.latitude,
              longitude: station.longitude,
            })
          }
          style={({ pressed }) => [
            styles.navButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Text style={[styles.navText, { color: colors.background }]}>안내</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    // 내 위치 버튼(bottom 24, 높이 48) 바로 위에 뜬다
    position: 'absolute',
    bottom: 84,
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  premiumBadge: {
    color: '#16A34A',
    borderColor: '#16A34A',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 16,
  },
  priceRows: {
    gap: 6,
    marginBottom: 12,
    minHeight: 66,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  skeleton: {
    height: 14,
    borderRadius: 7,
  },
  metaSkeleton: {
    flex: 1,
    marginRight: 40,
  },
  fuelLabel: {
    fontSize: 14,
  },
  fuelPrice: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    flex: 1,
    fontSize: 12,
  },
  navButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
