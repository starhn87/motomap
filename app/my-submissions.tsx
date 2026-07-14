import {
  StyleSheet,
  View,
  Text,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchMySubmissions } from '@/lib/api/mydata';
import { useAuthStore } from '@/stores/useAuthStore';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import type { Place } from '@/types';

function SubmissionSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Skeleton width={70} height={18} radius={10} />
            <Skeleton width={50} height={18} radius={10} />
          </View>
          <Skeleton width="80%" height={18} />
          <Skeleton width="65%" height={14} style={{ marginTop: 6 }} />
          <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function MySubmissionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { data: places, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-submissions', user?.id],
    queryFn: fetchMySubmissions,
  });

  const renderItem = ({ item }: { item: Place }) => {
    const category = CATEGORIES[item.category];

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '20' }]}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.approved ? `${semantic.success}20` : '#71717A20' },
            ]}>
            <Text
              style={[
                styles.statusText,
                { color: item.approved ? semantic.success : '#71717A' },
              ]}>
              {item.approved ? '승인됨' : '대기중'}
            </Text>
          </View>
        </View>
        <Text style={[styles.placeName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.placeAddress, { color: colors.textSecondary }]}>
          {item.address}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {new Date(item.createdAt).toLocaleDateString('ko-KR')}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <SubmissionSkeletonList />
      ) : !places?.length ? (
        <EmptyState
          icon="📍"
          title="제보한 장소가 없습니다"
          hint="라이더들과 나누고 싶은 장소를 알려주세요!"
          actionLabel="제보하러 가기"
          onAction={() => router.navigate('/submit')}
        />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
  list: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryIcon: { fontSize: 11, marginRight: 4 },
  categoryLabel: { fontSize: 11, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  placeName: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  placeAddress: { fontSize: 13, marginBottom: 4 },
  date: { fontSize: 11 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
