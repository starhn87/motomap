import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import RiderShareCard from '@/components/profile/RiderShareCard';
import CategoryIcon from '@/components/ui/CategoryIcon';
import EmptyState from '@/components/ui/EmptyState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useMyRides } from '@/hooks/usePlaceRides';
import type { MyRideBreakdown, MyRidePlace } from '@/lib/api/rides';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PlaceCategory } from '@/types';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';

function RideHistorySkeleton({ backgroundColor }: { backgroundColor: string }) {
  return (
    <ScrollView
      style={{ backgroundColor }}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}>
      <SkeletonContainer style={styles.rideMapSkeleton}>
        <View style={styles.rideMapSkeletonIcon}>
          <Skeleton width={38} height={38} radius={19} />
        </View>
        <View style={styles.rideRowSkeletonBody}>
          <Skeleton width={88} height={17} />
          <Skeleton width="74%" height={12} style={{ marginTop: 7 }} />
        </View>
      </SkeletonContainer>
      <SkeletonContainer style={styles.passportSkeleton}>
        <View style={styles.passportTop}>
          <View style={styles.passportTitleBody}>
            <Skeleton width={92} height={11} />
            <Skeleton width="62%" height={22} style={{ marginTop: 8 }} />
          </View>
          <Skeleton width={40} height={40} radius={20} />
        </View>
        <View style={styles.statsRow}>
          <Skeleton width={58} height={48} />
          <Skeleton width={1} height={38} />
          <Skeleton width={58} height={48} />
        </View>
        <View style={styles.milestones}>
          <Skeleton width={82} height={29} radius={15} />
          <Skeleton width={96} height={29} radius={15} />
        </View>
      </SkeletonContainer>
      <View style={styles.rideFilterSkeletons}>
        <Skeleton width={54} height={34} radius={17} />
        <Skeleton width={112} height={34} radius={17} />
      </View>
      <Skeleton width={82} height={18} style={{ marginVertical: 2 }} />
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonContainer key={index} style={styles.rideRowSkeleton}>
          <Skeleton width={34} height={34} radius={17} />
          <View style={styles.rideRowSkeletonBody}>
            <Skeleton width="58%" height={15} />
            <Skeleton width="76%" height={12} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={28} height={16} />
        </SkeletonContainer>
      ))}
    </ScrollView>
  );
}

// "8.10" — 목록에 연도까지는 과하고, 해가 바뀐 기록만 "24.12" 처럼 연도를 붙인다
function shortDate(iso: string): string {
  const date = new Date(iso);
  const thisYear = new Date().getFullYear();
  const monthDay = `${date.getMonth() + 1}.${date.getDate()}`;
  return date.getFullYear() === thisYear ? monthDay : `${date.getFullYear() % 100}.${monthDay}`;
}

function breakdownFor(item: MyRidePlace, bike: string | null): MyRideBreakdown {
  return bike ? item.byBike[bike] : item;
}

function getBikeTotals(rides: MyRidePlace[]): { model: string; rides: number }[] {
  const totals = new Map<string, number>();
  for (const ride of rides) {
    for (const [model, breakdown] of Object.entries(ride.byBike)) {
      totals.set(model, (totals.get(model) ?? 0) + breakdown.total);
    }
  }
  return [...totals]
    .map(([model, count]) => ({ model, rides: count }))
    .sort((a, b) => b.rides - a.rides);
}

function getCategoryMilestones(rides: MyRidePlace[]): { category: PlaceCategory; places: number }[] {
  const totals = new Map<PlaceCategory, number>();
  for (const ride of rides) {
    if (ride.category) totals.set(ride.category, (totals.get(ride.category) ?? 0) + 1);
  }
  return [...totals]
    .map(([category, places]) => ({ category, places }))
    .sort((a, b) => b.places - a.places)
    .slice(0, 3);
}

// 라이딩 기록 — 길안내로 실제 도착한 장소별 횟수. 기종별로 쌓인 장소와
// 카테고리를 패스포트처럼 돌아보고, 현재 성과를 공유할 수 있다.
export default function MyRidesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: rides, isLoading } = useMyRides();
  const [selectedBike, setSelectedBike] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

  if (isLoading) {
    return <RideHistorySkeleton backgroundColor={colors.background} />;
  }

  if (!rides?.length) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Text style={styles.emptyEmoji}>🏍️</Text>}
          title="아직 주행 기록이 없습니다"
          hint="라이딩 지도에서 달린 길을 기록하고 되돌아보세요."
          actionLabel="라이딩 지도 열기"
          onAction={() => router.push('/ride-map' as any)}
        />
      </View>
    );
  }

  const bikes = getBikeTotals(rides);
  const visibleRides = selectedBike ? rides.filter((ride) => !!ride.byBike[selectedBike]) : rides;
  const totalRides = visibleRides.reduce(
    (total, ride) => total + breakdownFor(ride, selectedBike).total,
    0,
  );
  const milestones = getCategoryMilestones(visibleRides);

  const renderItem = ({ item }: { item: MyRidePlace }) => {
    const breakdown = breakdownFor(item, selectedBike);
    const detail = [
      breakdown.goals > 0 ? `도착 ${breakdown.goals}` : null,
      breakdown.vias > 0 ? `경유 ${breakdown.vias}` : null,
    ].filter(Boolean).join(' · ');

    const openOnMap = () => {
      if (item.placeId) {
        focusPlaceOnMap(item.placeId, { source: 'my_rides' });
      } else if (item.latitude != null && item.longitude != null) {
        focusPointOnMap({
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          generalPlaceId: item.generalPlaceId ?? undefined,
        });
      }
    };

    return (
      <Pressable
        onPress={openOnMap}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}>
        {item.category && (
          <View style={[styles.categoryIcon, { backgroundColor: colors.background }]}>
            <CategoryIcon category={item.category} size={19} />
          </View>
        )}
        <View style={styles.rowBody}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
            {detail} · 마지막 {shortDate(breakdown.lastAt)}
          </Text>
        </View>
        <Text style={[styles.rowCount, { color: colors.text }]}>{breakdown.total}회</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </Pressable>
    );
  };

  const nickname = user?.user_metadata?.name
    ?? user?.user_metadata?.full_name
    ?? '라이더';

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.list}
        data={visibleRides}
        extraData={selectedBike}
        keyExtractor={(item) => item.placeId ?? `pt:${item.name}`}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              onPress={() => router.push('/ride-map' as any)}
              style={({ pressed }) => [
                styles.rideMapCard,
                { backgroundColor: colors.text, opacity: pressed ? 0.86 : 1 },
              ]}>
              <View style={[styles.rideMapIcon, { backgroundColor: colors.background }]}>
                <Ionicons name="map-outline" size={21} color={colors.text} />
              </View>
              <View style={styles.rideMapBody}>
                <Text style={[styles.rideMapTitle, { color: colors.background }]}>라이딩 지도</Text>
                <Text style={[styles.rideMapDescription, { color: colors.background }]}>
                  달린 길을 빠르게 재생하고 자주 간 지역을 확인해보세요.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.background} />
            </Pressable>

            <View
              style={[styles.passport, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.passportTop}>
                <View style={styles.passportTitleBody}>
                  <Text style={[styles.passportEyebrow, { color: colors.tint }]}>나의 주행 기록</Text>
                  <Text style={[styles.passportTitle, { color: colors.text }]} numberOfLines={2}>
                    {selectedBike ?? '모든 바이크'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="주행 기록 공유"
                  hitSlop={10}
                  onPress={() => setShareOpen(true)}
                  style={({ pressed }) => [
                    styles.shareButton,
                    { backgroundColor: colors.background },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Ionicons name="share-outline" size={19} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.statsRow}>
                <View>
                  <Text style={[styles.statValue, { color: colors.text }]}>{visibleRides.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>다녀온 곳</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View>
                  <Text style={[styles.statValue, { color: colors.text }]}>{totalRides}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>주행</Text>
                </View>
              </View>
              {milestones.length > 0 && (
                <View style={styles.milestones}>
                  {milestones.map(({ category, places }) => (
                    <View key={category} style={[styles.milestone, { backgroundColor: colors.background }]}>
                      <CategoryIcon category={category} size={15} />
                      <Text style={[styles.milestoneText, { color: colors.textSecondary }]}>
                        {CATEGORIES[category].label} {places}곳
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {bikes.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filters}>
                <Pressable
                  onPress={() => setSelectedBike(null)}
                  style={[
                    styles.filter,
                    { borderColor: selectedBike === null ? colors.tint : colors.border },
                    selectedBike === null && { backgroundColor: colors.tint },
                  ]}>
                  <Text style={[styles.filterText, { color: selectedBike === null ? colors.background : colors.text }]}>전체</Text>
                </Pressable>
                {bikes.map((bike) => {
                  const selected = selectedBike === bike.model;
                  return (
                    <Pressable
                      key={bike.model}
                      onPress={() => setSelectedBike(bike.model)}
                      style={[
                        styles.filter,
                        { borderColor: selected ? colors.tint : colors.border },
                        selected && { backgroundColor: colors.tint },
                      ]}>
                      <Text
                        style={[styles.filterText, { color: selected ? colors.background : colors.text }]}
                        numberOfLines={1}>
                        {bike.model} · {bike.rides}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>다녀온 장소</Text>
          </View>
        }
        renderItem={renderItem}
      />
      <RiderShareCard
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        nickname={nickname}
        bike={selectedBike}
        places={visibleRides.length}
        rides={totalRides}
        milestones={milestones}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  header: {
    gap: 16,
    marginBottom: 4,
  },
  rideMapCard: {
    minHeight: 84,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rideMapIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideMapBody: {
    flex: 1,
    gap: 3,
  },
  rideMapTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  rideMapDescription: {
    fontSize: 11.5,
    lineHeight: 16,
    opacity: 0.72,
  },
  rideMapSkeleton: {
    minHeight: 84,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rideMapSkeletonIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passport: {
    padding: 20,
    borderWidth: 1,
    borderRadius: 20,
    gap: 18,
  },
  passportSkeleton: {
    padding: 20,
    borderRadius: 20,
    gap: 18,
  },
  passportTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  passportTitleBody: {
    flex: 1,
  },
  passportEyebrow: {
    marginBottom: 5,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  passportTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
  },
  milestones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  milestoneText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterScroll: {
    marginHorizontal: -16,
  },
  filters: {
    gap: 8,
    paddingHorizontal: 16,
  },
  filter: {
    maxWidth: 210,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rideFilterSkeletons: {
    flexDirection: 'row',
    gap: 8,
  },
  rideRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rideRowSkeletonBody: {
    flex: 1,
  },
  categoryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowDetail: {
    fontSize: 12.5,
  },
  rowCount: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
