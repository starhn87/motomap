import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import CategoryIcon from '@/components/ui/CategoryIcon';
import EmptyState from '@/components/ui/EmptyState';
import { useColorScheme } from '@/components/useColorScheme';
import { APP_STORE_URL } from '@/constants/app';
import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useMyRides } from '@/hooks/usePlaceRides';
import { track } from '@/lib/analytics';
import type { MyRideBreakdown, MyRidePlace } from '@/lib/api/rides';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import type { PlaceCategory } from '@/types';

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

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  if (!rides?.length) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Text style={styles.emptyEmoji}>🏍️</Text>}
          title="아직 주행 기록이 없습니다"
          hint="길안내로 도착하면 자동으로 기록돼요."
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

  const sharePassport = async () => {
    const subject = selectedBike ? `${selectedBike} 주행 기록` : '나의 주행 기록';
    const result = await Share.share({
      title: subject,
      message: `${subject}\n모토맵에서 ${visibleRides.length}곳을 ${totalRides}번 달렸어요 🏍️\n\n모토맵 - 라이더를 위한 지도\n${APP_STORE_URL}`,
    });
    if (result.action === Share.sharedAction) {
      track.bikePassportShared({
        scope: selectedBike ? 'bike' : 'all',
        places: visibleRides.length,
        rides: totalRides,
      });
    }
  };

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
        focusPointOnMap({ name: item.name, latitude: item.latitude, longitude: item.longitude });
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

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={visibleRides}
      extraData={selectedBike}
      keyExtractor={(item) => item.placeId ?? `pt:${item.name}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={[styles.passport, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                onPress={() => void sharePassport()}
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
  passport: {
    padding: 20,
    borderWidth: 1,
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
