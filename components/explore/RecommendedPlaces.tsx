import { useEffect, useState } from 'react';
import { router } from 'expo-router';
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
import { useBikePlaceMatches } from '@/hooks/useRiderInsights';
import { CATEGORIES } from '@/constants/categories';
import { openNavigation } from '@/lib/navigation';
import { track } from '@/lib/analytics';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/stores/useAuthStore';
import type { BikePlaceMatch } from '@/lib/api/riderInsights';
import type { Place } from '@/types';

function PlaceCard({
  place,
  isNew,
  bikeMatch,
}: {
  place: Place;
  isNew?: boolean;
  bikeMatch?: BikePlaceMatch;
}) {
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

      {bikeMatch && (
        <View style={[styles.bikeEvidence, { backgroundColor: colors.tint + '14' }]}>
          <Text style={[styles.bikeEvidenceText, { color: colors.tint }]}>
            {bikeMatch.kind === 'same_model'
              ? `같은 기종 라이더 ${bikeMatch.exactRiders}명이 다녀갔어요`
              : `같은 유형 라이더 ${bikeMatch.supporters}명이 다녀갔어요`}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => {
          if (bikeMatch) track.bikeRecommendationSelected({ match: bikeMatch.kind });
          openNavigation({
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            placeId: place.id,
          });
        }}
        style={({ pressed }) => [
          styles.navBtn,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Text style={[styles.navText, { color: colors.background }]}>여기로 가기</Text>
      </Pressable>
    </View>
  );
}

function PlaceCardSkeleton({ showBikeEvidence = false }: { showBikeEvidence?: boolean }) {
  return (
    <SkeletonContainer>
      <View style={styles.skeletonCardHeader}>
        <Skeleton width={82} height={24} radius={12} />
        <Skeleton width={42} height={14} />
      </View>
      <Skeleton width="62%" height={22} />
      <Skeleton width="86%" height={14} style={{ marginTop: 6 }} />
      {showBikeEvidence && (
        <Skeleton width={190} height={29} radius={10} style={{ marginTop: 12 }} />
      )}
      <Skeleton
        width="100%"
        height={42}
        radius={12}
        style={{ marginTop: showBikeEvidence ? 12 : 14 }}
      />
    </SkeletonContainer>
  );
}

function RecommendedSkeleton({ showBikeSection }: { showBikeSection: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.regionScroll}
        contentContainerStyle={styles.regionChips}>
        {[58, 72, 64, 78, 68].map((width) => (
          <Skeleton key={width} width={width} height={32} radius={16} />
        ))}
      </ScrollView>

      {showBikeSection && (
        <View style={styles.section}>
          <Skeleton width={112} height={20} />
          <PlaceCardSkeleton showBikeEvidence />
        </View>
      )}

      <View style={styles.section}>
        <Skeleton width={82} height={20} />
        <PlaceCardSkeleton />
        <PlaceCardSkeleton />
      </View>

      <View style={styles.section}>
        <Skeleton width={98} height={20} />
        <PlaceCardSkeleton />
      </View>
    </ScrollView>
  );
}

export default function RecommendedPlaces() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((state) => state.user);
  const [region, setRegion] = useState<string | null>(null);
  const { data, isLoading, refetch, isRefetching } = useRecommendedPlaces(region);
  const bikeMatches = useBikePlaceMatches((data?.all ?? []).map((place) => place.id));

  const recent = data?.recent ?? [];
  const topRated = data?.topRated ?? [];
  const regions = data?.regions ?? [];
  const matchedBikePlaces = (data?.all ?? []).filter((place) => !!bikeMatches.data?.[place.id]);
  const bikeRecommended = matchedBikePlaces
    .filter((place) => !bikeMatches.data![place.id].visitedByMe)
    .sort((a, b) => {
      const left = bikeMatches.data![a.id];
      const right = bikeMatches.data![b.id];
      if (left.kind !== right.kind) return left.kind === 'same_model' ? -1 : 1;
      return right.supporters - left.supporters || b.rating - a.rating;
    })
    .slice(0, 8);

  useEffect(() => {
    if (bikeRecommended.length > 0) {
      track.bikeRecommendationsViewed({ recommendation_count: bikeRecommended.length });
    }
  }, [bikeRecommended.length]);

  const handleRefresh = async () => {
    const requests: Promise<unknown>[] = [refetch()];
    if (user && bikeMatches.activeBike) requests.push(bikeMatches.refetch());
    await Promise.all(requests);
  };

  const bikeRecommendationsLoading =
    !!user &&
    (bikeMatches.bikesLoading || (!!bikeMatches.activeBike && bikeMatches.isLoading));

  // 장소 목록을 먼저 보여준 뒤 상단에 바이크 추천을 끼워 넣으면 화면 전체가
  // 밀린다. 최초 로딩은 두 데이터가 모두 준비된 뒤 한 번에 확정한다.
  if (isLoading || bikeRecommendationsLoading) {
    return <RecommendedSkeleton showBikeSection={!!user} />;
  }

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
          refreshing={isRefetching || bikeMatches.isRefetching}
          onRefresh={handleRefresh}
          tintColor={colors.tint}
        />
      }>
      {regions.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.regionScroll}
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

      {!!user && !bikeMatches.bikesLoading && !bikeMatches.isLoading && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>내 바이크 추천</Text>
          {bikeMatches.activeBike ? (
            bikeRecommended.length > 0 ? (
              bikeRecommended.map((place) => (
                <PlaceCard
                  key={`bike-${place.id}`}
                  place={place}
                  bikeMatch={bikeMatches.data?.[place.id]}
                />
              ))
            ) : (
              <View
                style={[
                  styles.bikeEmpty,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}>
                <Text style={[styles.bikeEmptyTitle, { color: colors.text }]}>
                  {matchedBikePlaces.length > 0
                    ? '추천된 장소를 이미 모두 다녀왔어요'
                    : '추천 기록을 모으는 중이에요'}
                </Text>
                <Text style={[styles.bikeEmptyText, { color: colors.textSecondary }]}>
                  {matchedBikePlaces.length > 0
                    ? '새로운 라이더 기록이 쌓이면 다음 목적지를 바로 보여드릴게요.'
                    : `${bikeMatches.activeBike.model} 기준으로, 같은 기종·유형의 라이더 2명 이상이 다녀간 곳부터 추천해 드려요.`}
                </Text>
              </View>
            )
          ) : (
            <Pressable
              onPress={() => router.push('/edit-bike')}
              style={({ pressed }) => [
                styles.bikeEmpty,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.bikeEmptyTitle, { color: colors.text }]}>내 바이크를 먼저 등록해 주세요</Text>
              <Text style={[styles.bikeEmptyText, { color: colors.textSecondary }]}>기종에 맞는 라이더 목적지를 골라 드릴게요.</Text>
            </Pressable>
          )}
        </View>
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
  regionScroll: { marginHorizontal: -16 },
  regionChips: { gap: 6, paddingHorizontal: 16, paddingBottom: 4 },
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
  bikeEvidence: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 12,
  },
  bikeEvidenceText: { fontSize: 12, fontWeight: '700' },
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
  bikeEmpty: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
  },
  bikeEmptyTitle: { fontSize: 15, fontWeight: '700' },
  bikeEmptyText: { fontSize: 13, lineHeight: 19 },
  skeletonCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
});
