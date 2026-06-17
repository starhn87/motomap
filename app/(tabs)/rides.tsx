import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRides } from '@/hooks/useRides';
import { useRideStore } from '@/stores/useRideStore';
import {
  formatDistance,
  formatRideDuration,
  formatSpeed,
  formatRideDate,
} from '@/constants/course';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import LoginPrompt from '@/components/auth/LoginPrompt';
import type { Ride } from '@/types';

function RideSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <Skeleton width="55%" height={20} />
          <Skeleton width="35%" height={12} style={{ marginTop: 8 }} />
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 24 }}>
            <Skeleton width={50} height={28} />
            <Skeleton width={50} height={28} />
            <Skeleton width={50} height={28} />
          </View>
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function RidesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const status = useRideStore((s) => s.status);
  const { data: rides, isLoading, refetch, isRefetching } = useRides();

  if (!user) {
    return <LoginPrompt message="주행을 기록하려면 로그인이 필요합니다." />;
  }

  const isRiding = status !== 'idle';

  const renderRide = ({ item }: { item: Ride }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() => router.push(`/ride/${item.id}`)}>
      <Text style={[styles.rideName, { color: colors.text }]} numberOfLines={1}>
        {item.title || formatRideDate(item.createdAt)}
      </Text>
      <Text style={[styles.rideDate, { color: colors.textSecondary }]}>
        {formatRideDate(item.createdAt)}
      </Text>

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
            {formatRideDuration(item.duration)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            시간
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatSpeed(item.avgSpeed)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            평균
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        onPress={() => router.push('/ride/active')}
        style={({ pressed }) => [
          styles.startButton,
          {
            backgroundColor: isRiding ? '#22C55E' : colors.tint,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <FontAwesome
          name={isRiding ? 'location-arrow' : 'play'}
          size={16}
          color={isRiding ? '#FFFFFF' : colors.background}
        />
        <Text
          style={[
            styles.startButtonText,
            { color: isRiding ? '#FFFFFF' : colors.background },
          ]}>
          {isRiding ? '주행 중 — 계속하기' : '주행 시작'}
        </Text>
      </Pressable>

      {isLoading ? (
        <RideSkeletonList />
      ) : !rides?.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            아직 주행 기록이 없습니다.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            주행 시작 버튼을 눌러 첫 라이딩을 기록해보세요!
          </Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={renderRide}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 16,
    borderRadius: 14,
  },
  startButtonText: { fontSize: 16, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  rideName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  rideDate: { fontSize: 12, marginBottom: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 11 },
  statDivider: { width: 1, height: 26 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
