import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useCourses } from '@/hooks/useCourses';
import { useMapStore } from '@/stores/useMapStore';
import { estimateRoundTripMinutes } from '@/lib/roundTrip';
import { formatDistance, formatDuration, seasonalBadge } from '@/constants/course';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import RecommendedPlaces from '@/components/explore/RecommendedPlaces';
import type { RidingCourse } from '@/types';

type Segment = 'courses' | 'places';

function CourseSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="90%" height={14} style={{ marginTop: 8 }} />
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 24 }}>
            <Skeleton width={60} height={28} />
            <Skeleton width={60} height={28} />
          </View>
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function ExploreScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [segment, setSegment] = useState<Segment>('courses');
  const { data: courses, isLoading, refetch, isRefetching } = useCourses();
  const userLocation = useMapStore((s) => s.userLocation);

  // 왕복 시간 필터 — "지금 나가면 N시간짜리"로 고르는 라이더 관점. 경계는 표시
  // 시간 + 15분 여유(근사 오차 흡수). 내 위치가 없으면 칩 자체를 숨긴다.
  const [tripFilter, setTripFilter] = useState<number | null>(null);
  const roundTrips = useMemo(() => {
    if (!userLocation || !courses) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const c of courses) {
      const min = estimateRoundTripMinutes(userLocation, c);
      if (min != null) map.set(c.id, min);
    }
    return map;
  }, [courses, userLocation]);

  const visibleCourses = useMemo(() => {
    if (!courses) return courses;
    if (tripFilter == null || roundTrips.size === 0) return courses;
    return courses
      .filter((c) => (roundTrips.get(c.id) ?? Infinity) <= tripFilter + 15)
      .sort((a, b) => (roundTrips.get(a.id) ?? 0) - (roundTrips.get(b.id) ?? 0));
  }, [courses, tripFilter, roundTrips]);

  const renderCourse = ({ item }: { item: RidingCourse }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() => router.push(`/course/${item.id}`)}>
      {item.rating > 0 && (
        <View style={styles.cardHeader}>
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingStar}>★</Text>
            <Text style={[styles.ratingText, { color: colors.text }]}>
              {item.rating}
            </Text>
          </View>
        </View>
      )}

      {seasonalBadge(item.tags) && (
        <View style={[styles.seasonBadge, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.seasonBadgeText, { color: colors.text }]}>
            {seasonalBadge(item.tags)}
          </Text>
        </View>
      )}
      <Text style={[styles.courseName, { color: colors.text }]}>
        {item.name}
      </Text>
      {item.description ? (
        <Text
          style={[styles.courseDesc, { color: colors.textSecondary }]}
          numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatDistance(item.distance)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            거리
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatDuration(item.duration)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            예상 시간
          </Text>
        </View>
        {roundTrips.has(item.id) && (
          <>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.tint }]}>
                {formatDuration(roundTrips.get(item.id)!)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                내 위치 왕복
              </Text>
            </View>
          </>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.segmentRow}>
        {(['courses', 'places'] as Segment[]).map((seg) => {
          const active = segment === seg;
          const label = seg === 'courses' ? '코스' : '추천 목적지';
          return (
            <Pressable
              key={seg}
              onPress={() => setSegment(seg)}
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'courses' ? (
        isLoading ? (
          <CourseSkeletonList />
        ) : !courses?.length ? (
          <EmptyState
            icon="🛣️"
            title="등록된 코스가 없습니다"
            hint="달려본 코스가 있다면 라이더들과 나눠보세요!"
            actionLabel="코스 제보하러 가기"
            onAction={() => router.navigate('/submit')}
          />
        ) : (
          <FlatList
            data={visibleCourses}
            keyExtractor={(item) => item.id}
            renderItem={renderCourse}
            ListHeaderComponent={
              roundTrips.size > 0 ? (
                <View style={styles.tripChipRow}>
                  {[
                    { label: '전체', value: null },
                    { label: '왕복 1시간', value: 60 },
                    { label: '왕복 2시간', value: 120 },
                    { label: '왕복 3시간', value: 180 },
                  ].map((chip) => {
                    const active = tripFilter === chip.value;
                    return (
                      <Pressable
                        key={chip.label}
                        onPress={() => setTripFilter(chip.value)}
                        style={[
                          styles.tripChip,
                          {
                            backgroundColor: active ? colors.tint : colors.surface,
                            borderColor: active ? colors.tint : colors.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.tripChipText,
                            { color: active ? colors.background : colors.text },
                          ]}>
                          {chip.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null
            }
            ListEmptyComponent={
              tripFilter != null ? (
                <Text style={[styles.tripEmpty, { color: colors.textSecondary }]}>
                  이 시간 안에 다녀올 코스가 아직 없어요
                </Text>
              ) : null
            }
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
  container: {
    flex: 1,
  },
  tripChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tripChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tripChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tripEmpty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
  },
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
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 13,
    color: semantic.star,
    marginRight: 2,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  courseName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  courseDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  seasonBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  seasonBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
