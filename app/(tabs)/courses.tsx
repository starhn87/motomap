import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useRidingGuides } from '@/hooks/useRidingGuides';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import RecommendedPlaces from '@/components/explore/RecommendedPlaces';
import type { RidingGuide } from '@/types';

type Segment = 'riding' | 'places';

function RidingGuideSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonContainer key={index}>
          <Skeleton width="42%" height={12} />
          <Skeleton width="72%" height={22} style={{ marginTop: 10 }} />
          <Skeleton width="94%" height={14} style={{ marginTop: 8 }} />
          <View style={styles.skeletonChips}>
            <Skeleton width={64} height={27} radius={14} />
            <Skeleton width={78} height={27} radius={14} />
          </View>
        </SkeletonContainer>
      ))}
    </View>
  );
}

function RidingGuideCard({ guide }: { guide: RidingGuide }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const primary = guide.stops.find((stop) => stop.role === 'primary');
  const chips = [...guide.regions, ...guide.tags].slice(0, 3);

  return (
    <Pressable
      onPress={() => router.push(`/riding/${guide.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      {primary && (
        <View style={styles.destinationRow}>
          <MaterialCommunityIcons name="map-marker" size={15} color={colors.tint} />
          <Text style={[styles.destination, { color: colors.textSecondary }]} numberOfLines={1}>
            {primary.place.name}
          </Text>
        </View>
      )}

      <Text style={[styles.guideTitle, { color: colors.text }]} numberOfLines={2}>
        {guide.title}
      </Text>
      <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
        {guide.summary}
      </Text>

      {guide.featuredRoads[0] && (
        <View style={styles.roadRow}>
          <MaterialCommunityIcons name="road-variant" size={15} color={colors.textSecondary} />
          <Text style={[styles.road, { color: colors.textSecondary }]} numberOfLines={1}>
            {guide.featuredRoads[0]}
          </Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.chipRow}>
          {chips.map((chip) => (
            <View key={chip} style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>{chip}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.placeCount, { color: colors.textSecondary }]}>장소 {guide.stops.length}</Text>
      </View>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [segment, setSegment] = useState<Segment>('riding');
  const { data: guides, isLoading, refetch, isRefetching } = useRidingGuides();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.segmentRow}>
        {(['riding', 'places'] as Segment[]).map((item) => {
          const active = segment === item;
          return (
            <Pressable
              key={item}
              onPress={() => setSegment(item)}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.tint : 'transparent',
                  borderColor: active ? colors.tint : colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.segmentLabel,
                  { color: active ? colors.background : colors.textSecondary },
                ]}>
                {item === 'riding' ? '라이딩 추천' : '추천 목적지'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'riding' ? (
        isLoading ? (
          <RidingGuideSkeletonList />
        ) : !guides?.length ? (
          <EmptyState
            icon={
              <MaterialCommunityIcons
                name="map-marker-path"
                size={44}
                color={colors.textSecondary}
              />
            }
            title="라이딩 추천을 준비하고 있어요"
            hint="좋았던 목적지와 달리기 좋은 길을 알려주세요."
            actionLabel="라이딩 추천 보내기"
            onAction={() =>
              router.navigate({
                pathname: '/submit',
                params: { submitType: 'riding', submitTs: String(Date.now()) },
              })
            }
          />
        ) : (
          <FlatList
            data={guides}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RidingGuideCard guide={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.tint}
              />
            }
          />
        )
      ) : (
        <RecommendedPlaces />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 14, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  skeletonChips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  card: { padding: 17, borderRadius: 16, borderWidth: 1 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  destination: { flex: 1, fontSize: 12, fontWeight: '700' },
  guideTitle: { fontSize: 20, lineHeight: 27, fontWeight: '800' },
  summary: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  roadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  road: { flex: 1, fontSize: 13, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 15,
  },
  chipRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  chipText: { fontSize: 11, fontWeight: '700' },
  placeCount: { fontSize: 11, fontWeight: '700' },
});
