import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { formatDistance, formatDuration, seasonalBadge } from '@/constants/course';
import { useColorScheme } from '@/components/useColorScheme';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import { track } from '@/lib/analytics';
import { haversine } from '@/lib/distance';
import { useMapStore } from '@/stores/useMapStore';
import Skeleton from '@/components/ui/Skeleton';
import type { RidingCourse } from '@/types';

interface Props {
  courses: RidingCourse[];
}

function startDistance(course: RidingCourse, latitude: number, longitude: number): number | null {
  const start = course.routeGeometry?.[0] ?? course.coordinates[0];
  if (!start) return null;
  return haversine(
    { latitude, longitude },
    { latitude: start[1], longitude: start[0] },
  );
}

export default function WeekendRideRecommendations({ courses }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const userLocation = useMapStore((state) => state.userLocation);
  const mapCenter = useMapStore((state) => state.mapCenter);
  const anchor = userLocation ?? mapCenter;
  const { data: courseLibrary, isLoading: libraryLoading } = useCourseLibrary();
  const tracked = useRef(false);

  // 위치·완주 기록이 늦게 도착해 이미 보인 카드가 재정렬되지 않도록 최초 표시
  // 시점의 추천 기준을 이 화면을 보는 동안 고정한다.
  const recommendationContext = useRef<{
    anchor: { latitude: number; longitude: number } | null;
    completedIds: Set<string>;
  } | null>(null);
  if (!libraryLoading && recommendationContext.current === null) {
    recommendationContext.current = {
      anchor,
      completedIds: new Set(
        (courseLibrary ?? [])
          .filter((item) => item.completionCount > 0)
          .map((item) => item.course.id),
      ),
    };
  }

  if (libraryLoading || !recommendationContext.current) {
    return (
      <View style={styles.container}>
        <View style={styles.headingRow}>
          <Skeleton width={92} height={10} />
          <Skeleton width={210} height={22} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={272} height={142} radius={15} />
        <Skeleton width={220} height={11} style={{ marginTop: 7 }} />
      </View>
    );
  }

  const { anchor: recommendationAnchor, completedIds } = recommendationContext.current;
  const recommendations = courses
    .map((course) => {
      const distance = recommendationAnchor
        ? startDistance(course, recommendationAnchor.latitude, recommendationAnchor.longitude)
        : null;
      let score = course.rating * 20 + Math.min(course.reviewCount, 50);
      if (seasonalBadge(course.tags)) score += 1_000;
      if (!completedIds.has(course.id)) score += 250;
      if (course.duration >= 60 && course.duration <= 180) score += 100;
      if (distance !== null) score -= Math.min(distance / 1_000, 300);
      return { course, distance, score };
    })
    .sort((a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name, 'ko'))
    .slice(0, 3);

  useEffect(() => {
    if (tracked.current || recommendations.length === 0) return;
    tracked.current = true;
    track.weekendRideOpened({
      recommendation_count: recommendations.length,
    });
  }, [recommendations.length]);

  if (recommendations.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>주말 추천 코스</Text>
          <Text style={[styles.title, { color: colors.text }]}>이번 주말, 어디로 달릴까요?</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cardScroll}
        contentContainerStyle={styles.cardRow}>
        {recommendations.map(({ course, distance }) => {
          const season = seasonalBadge(course.tags);
          const completed = completedIds.has(course.id);
          return (
            <Pressable
              key={course.id}
              onPress={() => router.push(`/course/${course.id}`)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}>
              <View style={styles.reasonRow}>
                {season ? (
                  <View style={[styles.reasonBadge, { backgroundColor: `${season.color}18` }]}>
                    <MaterialCommunityIcons name={season.icon as any} size={13} color={season.color} />
                    <Text style={[styles.reasonText, { color: season.color }]}>{season.label}</Text>
                  </View>
                ) : !completed ? (
                  <View style={[styles.reasonBadge, { backgroundColor: `${colors.tint}14` }]}>
                    <MaterialCommunityIcons name="map-marker-path" size={13} color={colors.tint} />
                    <Text style={[styles.reasonText, { color: colors.tint }]}>아직 안 달린 코스</Text>
                  </View>
                ) : (
                  <View style={[styles.reasonBadge, { backgroundColor: colors.surfaceMuted }]}>
                    <MaterialCommunityIcons name="replay" size={13} color={colors.textSecondary} />
                    <Text style={[styles.reasonText, { color: colors.textSecondary }]}>다시 달리기</Text>
                  </View>
                )}
                {course.rating > 0 && (
                  <Text style={[styles.rating, { color: colors.textSecondary }]}>★ {course.rating}</Text>
                )}
              </View>
              <Text style={[styles.courseName, { color: colors.text }]} numberOfLines={2}>{course.name}</Text>
              {course.sectionFrom && course.sectionTo && (
                <Text style={[styles.route, { color: colors.textSecondary }]} numberOfLines={1}>
                  {course.sectionFrom} → {course.sectionTo}
                </Text>
              )}
              <View style={styles.metaRow}>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatDistance(course.distance)}</Text>
                <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatDuration(course.duration)}</Text>
                {recommendationAnchor && distance !== null && (
                  <>
                    <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>출발지까지 {formatDistance(distance / 1_000)}</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.helper, { color: colors.textSecondary }]}>계절·거리·라이더 평가를 바탕으로 골랐어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  headingRow: {
    marginBottom: 11,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
  },
  cardScroll: {
    marginHorizontal: -16,
  },
  cardRow: {
    gap: 10,
    paddingHorizontal: 16,
  },
  card: {
    width: 272,
    minHeight: 142,
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
  },
  reasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  reasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  reasonText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rating: {
    fontSize: 11,
    fontWeight: '700',
  },
  courseName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  route: {
    fontSize: 12,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 'auto',
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
  },
  dot: {
    fontSize: 10,
  },
  helper: {
    fontSize: 11,
    marginTop: 7,
  },
});
