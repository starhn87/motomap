import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useGasStationDetail } from '@/hooks/useGasStations';
import { openNavigation } from '@/lib/navigation';
import { FUEL_LABELS, formatTradeAt, type GasStation } from '@/lib/api/gasStations';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGeneralFavorite, useToggleGeneralFavorite } from '@/hooks/useFavorites';
import { fullTankCost, myFuelProd, useMyBike } from '@/lib/bike';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';

interface Props {
  station: GasStation;
  onClose: () => void;
}

export default function GasStationCard({ station, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: detail, isLoading } = useGasStationDetail(station.id);
  // 내 바이크를 등록했으면 그 유종을 강조하고 가득 주유비를 보여준다
  const { spec: myBike } = useMyBike();
  const myProd = myFuelProd(myBike);

  // 주유소는 오피넷 데이터라 등록 장소가 아니다 — 일반 장소 즐겨찾기로 담는다
  // (migration 032). 자주 가는 주유소는 라이더에게 분명한 즐겨찾기 대상이다.
  const user = useAuthStore((st) => st.user);
  const favorite = useGeneralFavorite(station);
  const isFavorite = !!favorite;
  const { mutateAsync: toggleFavorite, isPending: favPending } = useToggleGeneralFavorite();

  const handleFavorite = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    try {
      await toggleFavorite({
        place: {
          name: station.name,
          // 주소는 상세에만 온다 — 아직 안 왔으면 빈 값으로 두고 이름·좌표로 담는다
          address: detail?.address ?? '',
          latitude: station.latitude,
          longitude: station.longitude,
        },
        on: !isFavorite,
        favoriteId: favorite?.id,
      });
      haptics.selection();
    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

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
        {/* 제목 줄에 맞춰 묶는다 — 헤더가 flex-start 라 그냥 두면 두 줄짜리
            titleWrap 기준으로 앉아 제목보다 아래로 내려간다. */}
        <View style={styles.headerActions}>
          {/* 여백은 padding 이 아니라 hitSlop 으로 — 아이콘이 줄 높이보다
              커지면 잘린다 */}
          <Pressable
            accessibilityLabel={isFavorite ? '주유소 즐겨찾기 해제' : '주유소 즐겨찾기'}
            accessibilityRole="button"
            onPress={handleFavorite}
            disabled={favPending}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed || favPending ? 0.55 : 1 })}>
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={20}
              color={isFavorite ? '#FACC15' : colors.textSecondary}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="주유소 정보 닫기"
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
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
            ).map((p) => {
              const mine = p.prod === myProd;
              return (
                <View key={p.prod} style={styles.priceRow}>
                  <Text
                    style={[
                      styles.fuelLabel,
                      { color: mine ? colors.tint : colors.textSecondary },
                      mine && styles.fuelMine,
                    ]}>
                    {FUEL_LABELS[p.prod as keyof typeof FUEL_LABELS] ?? p.prod}
                    {mine ? ' (내 바이크)' : ''}
                  </Text>
                  <Text style={[styles.fuelPrice, { color: mine ? colors.tint : colors.text }]}>
                    {p.price.toLocaleString()}원
                  </Text>
                </View>
              );
            })}
        {!isLoading && (() => {
          const cost = fullTankCost(myBike, prices);
          if (!cost) return null;
          return (
            <Text style={[styles.tankCost, { color: colors.textSecondary }]}>
              가득 약 {cost.toLocaleString()}원 · 탱크 {myBike!.tankL}L 기준
            </Text>
          );
        })()}
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
    // 아이콘 줄 높이와 같게 — 이 값이 헤더 버튼 정렬의 기준이다
    lineHeight: 24,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    // 제목 한 줄 높이 — 아이콘이 제목과 같은 선에 앉는다
    height: 24,
    gap: 14,
    marginLeft: 10,
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
  fuelMine: {
    fontWeight: '700',
  },
  tankCost: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
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
