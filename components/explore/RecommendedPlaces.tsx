import { useState } from 'react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useRecommendedPlaces } from '@/hooks/usePlaces';
import { CATEGORIES } from '@/constants/categories';
import { openNavigation } from '@/lib/navigation';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import type { Place } from '@/types';

function PlaceCard({ place, isNew }: { place: Place; isNew?: boolean }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const cat = CATEGORIES[place.category];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <View style={styles.cardHeader}>
        <View style={[styles.catChip, { backgroundColor: cat.color + '22' }]}>
          <CategoryIcon category={place.category} size={13} color={cat.color} />
          <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
        </View>
        <View style={styles.headerRight}>
          {isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newText}>신규</Text>
            </View>
          )}
          {place.rating > 0 && (
            <View style={styles.rating}>
              <Text style={styles.star}>★</Text>
              <Text style={[styles.ratingText, { color: colors.text }]}>
                {place.rating}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {place.name}
      </Text>
      {place.address ? (
        <Text
          style={[styles.address, { color: colors.textSecondary }]}
          numberOfLines={1}>
          {place.address}
        </Text>
      ) : null}

      <Pressable
        onPress={() =>
          openNavigation({
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            placeId: place.id,
          })
        }
        style={({ pressed }) => [
          styles.navBtn,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Text style={[styles.navText, { color: colors.background }]}>여기로 가기</Text>
      </Pressable>
    </View>
  );
}

function RecommendedSkeleton() {
  return (
    <View style={styles.container}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <Skeleton width="35%" height={16} />
          <Skeleton width="70%" height={20} style={{ marginTop: 10 }} />
          <Skeleton width="90%" height={14} style={{ marginTop: 6 }} />
          <Skeleton width="100%" height={40} style={{ marginTop: 12 }} />
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function RecommendedPlaces() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [region, setRegion] = useState<string | null>(null);
  const { data, isLoading, refetch, isRefetching } = useRecommendedPlaces(region);

  if (isLoading) {
    return <RecommendedSkeleton />;
  }

  const recent = data?.recent ?? [];
  const topRated = data?.topRated ?? [];
  const regions = data?.regions ?? [];

  // 지역을 골라 결과가 빈 경우까지 여기서 걸리면 칩이 사라져 전체로 못 돌아온다.
  // 전체 데이터 자체가 없을 때만 빈 화면으로 빠진다.
  if (!regions.length && !recent.length && !topRated.length) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          아직 추천할 장소가 없습니다.
        </Text>
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          제보 탭에서 장소를 추가하면 여기에 추천돼요!
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.tint}
        />
      }>
      {regions.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionChips}>
          {[null, ...regions].map((r) => {
            const active = region === r;
            return (
              <Pressable
                key={r ?? 'all'}
                onPress={() => setRegion(r)}
                style={[
                  styles.regionChip,
                  {
                    backgroundColor: active ? colors.tint : colors.surfaceElevated,
                    borderColor: active ? colors.tint : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.regionChipText,
                    { color: active ? colors.background : colors.text },
                  ]}>
                  {r ?? '전체'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!recent.length && !topRated.length && (
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          {region} 지역에 아직 등록된 장소가 없어요.
        </Text>
      )}

      {recent.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            새로 추가
          </Text>
          {recent.map((p) => (
            <PlaceCard key={p.id} place={p} isNew />
          ))}
        </View>
      )}

      {topRated.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            라이더 추천
          </Text>
          {topRated.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  regionChips: { gap: 6, paddingBottom: 4 },
  regionChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  regionChipText: { fontSize: 13, fontWeight: '600' },
  section: { gap: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  catIcon: { fontSize: 12 },
  catLabel: { fontSize: 12, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newBadge: {
    backgroundColor: semantic.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  rating: { flexDirection: 'row', alignItems: 'center' },
  star: { fontSize: 13, color: semantic.star, marginRight: 2 },
  ratingText: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  address: { fontSize: 13, marginBottom: 14 },
  navBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  navText: { fontSize: 15, fontWeight: '700' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
