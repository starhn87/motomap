import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import RideMapVisualizer from '@/components/rides/RideMapVisualizer';
import EmptyState from '@/components/ui/EmptyState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors, { semantic } from '@/constants/Colors';
import { useRideSession } from '@/hooks/useRideSessions';
import { formatMeters, formatSeconds } from '@/lib/api/directions';
import { deleteRideSession } from '@/lib/api/rideSessions';
import { appAlert } from '@/lib/dialog';
import { toast } from '@/lib/toast';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function RideSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const sessionQuery = useRideSession(id);
  const session = sessionQuery.data;

  if (sessionQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={<Ionicons name="map-outline" size={40} color={colors.textSecondary} />}
          title="라이딩 기록을 찾을 수 없습니다"
          actionLabel="돌아가기"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const remove = () => {
    appAlert(
      '라이딩 기록 삭제',
      '이 경로 기록은 삭제하면 복구할 수 없습니다. 장소 방문 횟수는 그대로 유지됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            void deleteRideSession(session.id)
              .then(async () => {
                await queryClient.invalidateQueries({ queryKey: ['ride-sessions'] });
                queryClient.removeQueries({ queryKey: ['ride-session'], exact: false });
                router.back();
              })
              .catch(() => toast.error('라이딩 기록을 삭제하지 못했습니다.'));
          },
        },
      ],
    );
  };

  return (
    <PostHogMaskView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(session.startedAt)}</Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {session.goalName}
          </Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {session.endedReason === 'arrived' ? '도착' : session.endedReason === 'cancelled' ? '종료' : '중단'}
              </Text>
            </View>
            {session.isPartial ? (
              <View style={[styles.badge, { backgroundColor: `${semantic.warning}1A` }]}>
                <Text style={[styles.badgeText, { color: semantic.warning }]}>일부 기록</Text>
              </View>
            ) : null}
          </View>
        </View>

        <RideMapVisualizer sessions={[session]} style={styles.map} />

        <View style={[styles.stats, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatMeters(session.distanceM)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>기록 거리</Text>
          </View>
          <View style={[styles.statLine, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatSeconds(session.movingDurationS)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>이동 시간</Text>
          </View>
          <View style={[styles.statLine, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>{session.segmentCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>기록 구간</Text>
          </View>
        </View>

        <View style={[styles.info, { borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>바이크</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {session.bikeNickname || session.bikeModel || '설정하지 않음'}
            </Text>
          </View>
          {session.bikeNickname && session.bikeModel ? (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>기종</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{session.bikeModel}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>전체 시간</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{formatSeconds(session.durationS)}</Text>
          </View>
        </View>

        <Pressable
          onPress={remove}
          style={({ pressed }) => [
            styles.deleteButton,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="trash-outline" size={17} color={semantic.danger} />
          <Text style={[styles.deleteText, { color: semantic.danger }]}>이 라이딩 기록 삭제</Text>
        </Pressable>
      </ScrollView>
    </PostHogMaskView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    gap: 5,
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '800',
  },
  badges: {
    marginTop: 3,
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  map: {
    height: 390,
    borderRadius: 20,
  },
  stats: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
  },
  statLine: {
    width: StyleSheet.hairlineWidth,
    height: 34,
  },
  info: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  infoRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: '600',
  },
  deleteButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  deleteText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
