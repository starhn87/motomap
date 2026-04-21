import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useCourses } from '@/hooks/useCourses';
import { DIFFICULTY_CONFIG, formatDistance, formatDuration } from '@/constants/course';
import type { RidingCourse } from '@/types';

const FILTER_OPTIONS = [
  { key: null, label: '전체' },
  { key: 'easy', label: '초급', color: '#22C55E' },
  { key: 'medium', label: '중급', color: '#F59E0B' },
  { key: 'hard', label: '상급', color: '#EF4444' },
] as const;

function DifficultyBadge({
  difficulty,
}: {
  difficulty: 'easy' | 'medium' | 'hard';
}) {
  const { label, color } = DIFFICULTY_CONFIG[difficulty];

  return (
    <View style={[styles.difficultyBadge, { backgroundColor: color + '20' }]}>
      <Text style={[styles.difficultyText, { color }]}>{label}</Text>
    </View>
  );
}

export default function CoursesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const { data: courses, isLoading } = useCourses(difficulty);

  const renderCourse = ({ item }: { item: RidingCourse }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() => router.push(`/course/${item.id}`)}>
      <View style={styles.cardHeader}>
        <DifficultyBadge difficulty={item.difficulty} />
        {item.rating > 0 && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingStar}>★</Text>
            <Text style={[styles.ratingText, { color: colors.text }]}>
              {item.rating}
            </Text>
          </View>
        )}
      </View>

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
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.label}
            onPress={() => setDifficulty(opt.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  difficulty === opt.key
                    ? opt.key
                      ? (opt as any).color
                      : colors.tint
                    : colorScheme === 'dark'
                      ? '#1A1A1A'
                      : '#F3F4F6',
                borderColor:
                  difficulty === opt.key
                    ? 'transparent'
                    : colors.border,
              },
            ]}>
            <Text
              style={[
                styles.filterLabel,
                {
                  color:
                    difficulty === opt.key ? '#FFFFFF' : colors.text,
                },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator
          size="large"
          color={colors.tint}
          style={{ marginTop: 40 }}
        />
      ) : !courses?.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            등록된 코스가 없습니다.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            곧 라이더들의 추천 코스가 추가됩니다!
          </Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item.id}
          renderItem={renderCourse}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    height: 52,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 13,
    color: '#FBBF24',
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
