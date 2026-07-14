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
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useCourses } from '@/hooks/useCourses';
import { formatDistance, formatDuration } from '@/constants/course';
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
            data={courses}
            keyExtractor={(item) => item.id}
            renderItem={renderCourse}
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
