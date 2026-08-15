import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { formatDistance, formatDuration, seasonalBadge } from '@/constants/course';
import { useColorScheme } from '@/components/useColorScheme';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import { useWeather } from '@/hooks/useWeather';
import { track } from '@/lib/analytics';
import { haversine } from '@/lib/distance';
import type { RidingWeather } from '@/lib/api/weather';
import { useMapStore } from '@/stores/useMapStore';
import type { RidingCourse } from '@/types';

export interface WeekendWeatherDetails {
  weather: RidingWeather;
  latitude: number;
  longitude: number;
}

interface Props {
  courses: RidingCourse[];
  onWeatherPress: (details: WeekendWeatherDetails) => void;
}

function startDistance(course: RidingCourse, latitude: number, longitude: number): number | null {
  const start = course.routeGeometry?.[0] ?? course.coordinates[0];
  if (!start) return null;
  return haversine(
    { latitude, longitude },
    { latitude: start[1], longitude: start[0] },
  );
}

export default function WeekendRideRecommendations({ courses, onWeatherPress }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const userLocation = useMapStore((state) => state.userLocation);
  const mapCenter = useMapStore((state) => state.mapCenter);
  const anchor = userLocation ?? mapCenter;
  const { data: weather, isLoading: weatherLoading } = useWeather(
    anchor?.latitude,
    anchor?.longitude,
  );
  const { data: courseLibrary } = useCourseLibrary();
  const tracked = useRef(false);

  const completedIds = new Set(
    (courseLibrary ?? [])
      .filter((item) => item.completionCount > 0)
      .map((item) => item.course.id),
  );
  const recommendations = courses
    .map((course) => {
      const distance = anchor
        ? startDistance(course, anchor.latitude, anchor.longitude)
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
    if (tracked.current || recommendations.length === 0 || (anchor && weatherLoading)) return;
    tracked.current = true;
    track.weekendRideOpened({
      has_weather: !!weather,
      recommendation_count: recommendations.length,
    });
  }, [anchor, recommendations.length, weather, weatherLoading]);

  if (recommendations.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>WEEKEND RIDE</Text>
          <Text style={[styles.title, { color: colors.text }]}>이번 주말, 어디로 달릴까요?</Text>
        </View>
        {weather && anchor && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${userLocation ? '현재 위치' : '지도 지역'} 날씨 상세 보기`}
            hitSlop={6}
            onPress={() => {
              track.weekendWeatherOpened({ location_source: userLocation ? 'user' : 'map' });
              onWeatherPress({
                weather,
                latitude: anchor.latitude,
                longitude: anchor.longitude,
              });
            }}
            style={({ pressed }) => [
              styles.weatherBadge,
              { backgroundColor: `${weather.gradeColor}16`, borderColor: `${weather.gradeColor}55` },
              pressed && { opacity: 0.65 },
            ]}>
            <Text style={styles.weatherEmoji}>{weather.current.emoji}</Text>
            <View style={styles.weatherCopy}>
              <Text style={[styles.weatherLabel, { color: weather.gradeColor }]}>
                {userLocation ? '현재 위치' : '지도 지역'} · 라이딩 {weather.grade}
              </Text>
              <Text style={[styles.weatherMeta, { color: colors.textSecondary }]}>{weather.current.temp}° · 강수 {weather.current.pop}%</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={15} color={weather.gradeColor} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
                {userLocation && distance !== null && (
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
      {!weather && (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>계절·거리·라이더 평가를 바탕으로 골랐어요.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 11,
  },
  headingCopy: {
    flex: 1,
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
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  weatherEmoji: {
    fontSize: 17,
  },
  weatherCopy: {
    flexShrink: 1,
  },
  weatherLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  weatherMeta: {
    fontSize: 9,
    marginTop: 1,
  },
  cardRow: {
    gap: 10,
    paddingRight: 4,
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
