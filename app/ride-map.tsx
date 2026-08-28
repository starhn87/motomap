import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import RideMapVisualizer from '@/components/rides/RideMapVisualizer';
import EmptyState from '@/components/ui/EmptyState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useRideSessions } from '@/hooks/useRideSessions';
import type { RideSession } from '@/lib/api/rideSessions';
import { formatMeters, formatSeconds } from '@/lib/api/directions';

type RangeKey = '30d' | 'year' | 'all';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '30d', label: '최근 30일' },
  { key: 'year', label: '올해' },
  { key: 'all', label: '전체' },
];

function dateRange(key: RangeKey) {
  const now = new Date();
  const from = key === '30d'
    ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    : key === 'year'
      ? new Date(now.getFullYear(), 0, 1)
      : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

function bikeKey(session: RideSession): string | null {
  if (session.bikeId) return `id:${session.bikeId}`;
  if (session.bikeModel) return `snapshot:${session.bikeModel}:${session.bikeNickname ?? ''}`;
  return null;
}

function bikeLabel(session: RideSession): string {
  return session.bikeNickname || session.bikeModel || '바이크 미설정';
}

function formatRideDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso));
}

export default function RideMapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [selectedBike, setSelectedBike] = useState<string | null>(null);
  const range = useMemo(() => dateRange(rangeKey), [rangeKey]);
  const sessionsQuery = useRideSessions(range);
  const sessions = sessionsQuery.data ?? [];

  const bikeOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const session of sessions) {
      const key = bikeKey(session);
      if (key && !options.has(key)) options.set(key, bikeLabel(session));
    }
    return [...options].map(([key, label]) => ({ key, label }));
  }, [sessions]);

  useEffect(() => {
    if (selectedBike && !bikeOptions.some((option) => option.key === selectedBike)) {
      setSelectedBike(null);
    }
  }, [bikeOptions, selectedBike]);

  const visibleSessions = selectedBike
    ? sessions.filter((session) => bikeKey(session) === selectedBike)
    : sessions;
  const distanceM = visibleSessions.reduce((total, session) => total + session.distanceM, 0);
  const durationS = visibleSessions.reduce(
    (total, session) => total + session.movingDurationS,
    0,
  );
  const openSession = (id: string) => {
    router.push({ pathname: '/ride/[id]', params: { id } } as any);
  };

  if (sessionsQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>라이딩 지도를 불러오는 중</Text>
      </View>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Ionicons name="map-outline" size={40} color={colors.textSecondary} />}
          title="라이딩 지도를 불러오지 못했습니다"
          hint="잠시 후 다시 시도해주세요."
          actionLabel="다시 시도"
          onAction={() => void sessionsQuery.refetch()}
        />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Text style={styles.emptyEmoji}>🏍️</Text>}
          title="아직 지도에 그릴 라이딩이 없습니다"
          hint={rangeKey === 'all'
            ? '설정에서 라이딩 경로 기록을 켠 뒤 모토맵 길안내로 달려보세요.'
            : '선택한 기간에 기록된 경로가 없습니다.'}
          actionLabel={rangeKey === 'all' ? '기록 설정 보기' : '전체 기록 보기'}
          onAction={() => {
            if (rangeKey === 'all') router.push('/settings' as any);
            else setRangeKey('all');
          }}
        />
      </View>
    );
  }

  return (
    <PostHogMaskView style={[styles.container, { backgroundColor: colors.background }]}>
      <RideMapVisualizer
        sessions={visibleSessions}
        style={styles.map}
        mapPadding={{ top: bikeOptions.length > 0 ? 142 : 100 }}
        onSessionPress={openSession}
      />

      <View
        style={[
          styles.filtersPanel,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {RANGES.map((rangeOption) => {
            const selected = rangeOption.key === rangeKey;
            return (
              <Pressable
                key={rangeOption.key}
                onPress={() => setRangeKey(rangeOption.key)}
                style={[
                  styles.filterChip,
                  { borderColor: selected ? colors.tint : colors.border },
                  selected && { backgroundColor: colors.tint },
                ]}>
                <Text style={[styles.filterText, { color: selected ? colors.background : colors.text }]}>
                  {rangeOption.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {bikeOptions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            <Pressable
              onPress={() => setSelectedBike(null)}
              style={[
                styles.bikeChip,
                { borderColor: selectedBike === null ? '#2563EB' : colors.border },
              ]}>
              <Text style={[styles.bikeText, { color: selectedBike === null ? '#2563EB' : colors.textSecondary }]}>모든 바이크</Text>
            </Pressable>
            {bikeOptions.map((option) => {
              const selected = selectedBike === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setSelectedBike(option.key)}
                  style={[
                    styles.bikeChip,
                    { borderColor: selected ? '#2563EB' : colors.border },
                  ]}>
                  <Text style={[styles.bikeText, { color: selected ? '#2563EB' : colors.textSecondary }]} numberOfLines={1}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: colors.text }]}>{visibleSessions.length}번 라이딩</Text>
          <Text style={[styles.statDivider, { color: colors.textSecondary }]}>·</Text>
          <Text style={[styles.stat, { color: colors.text }]}>{formatMeters(distanceM)}</Text>
          <Text style={[styles.statDivider, { color: colors.textSecondary }]}>·</Text>
          <Text style={[styles.stat, { color: colors.text }]}>{formatSeconds(durationS)}</Text>
        </View>
      </View>

      <View
        style={[styles.recent, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <FlatList
          horizontal
          data={visibleSessions}
          keyExtractor={(session) => session.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentContent}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={5}
          renderItem={({ item: session }) => (
            <Pressable
              onPress={() => openSession(session.id)}
              style={({ pressed }) => [
                styles.rideCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.rideDate, { color: colors.textSecondary }]}>{formatRideDate(session.startedAt)}</Text>
              <Text style={[styles.rideGoal, { color: colors.text }]} numberOfLines={1}>{session.goalName}</Text>
              <Text style={[styles.rideMeta, { color: colors.textSecondary }]}>
                {formatMeters(session.distanceM)}{session.isPartial ? ' · 일부 기록' : ''}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </PostHogMaskView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
  },
  emptyEmoji: {
    fontSize: 42,
  },
  map: {
    flex: 1,
  },
  filtersPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    zIndex: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingVertical: 11,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  filterRow: {
    gap: 7,
    paddingHorizontal: 11,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bikeChip: {
    maxWidth: 180,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bikeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  statsRow: {
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stat: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statDivider: {
    fontSize: 12,
  },
  recent: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recentContent: {
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rideCard: {
    width: 176,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rideDate: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  rideGoal: {
    marginTop: 3,
    fontSize: 13.5,
    fontWeight: '700',
  },
  rideMeta: {
    marginTop: 3,
    fontSize: 11.5,
  },
});
