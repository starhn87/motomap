import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchMyReviews } from '@/lib/api/mydata';
import { useAuthStore } from '@/stores/useAuthStore';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import StarRating from '@/components/review/StarRating';

function ReviewSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonContainer key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Skeleton width="50%" height={16} />
            <Skeleton width={60} height={14} />
          </View>
          <Skeleton width="95%" height={14} style={{ marginTop: 4 }} />
          <Skeleton width="70%" height={14} style={{ marginTop: 4 }} />
          <Skeleton width={80} height={12} style={{ marginTop: 8 }} />
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function MyReviewsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { data: reviews, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-reviews', user?.id],
    queryFn: fetchMyReviews,
  });

  // 탭하면 지도의 해당 장소 시트가 펼쳐지고 이 리뷰로 스크롤·강조된다
  const renderItem = ({ item }: { item: any }) => (
    <Pressable
      onPress={() =>
        router.navigate({
          pathname: '/',
          params: {
            focusPlaceId: item.placeId,
            focusTs: String(Date.now()),
            focusReviewId: item.id,
          },
        })
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.placeName, { color: colors.tint }]}>
          {item.placeName}
        </Text>
        <StarRating rating={item.rating} size={14} readonly />
      </View>
      {item.content ? (
        <Text style={[styles.content, { color: colors.text }]}>
          {item.content}
        </Text>
      ) : null}
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ReviewSkeletonList />
      ) : !reviews?.length ? (
        <EmptyState
          icon="💬"
          title="작성한 리뷰가 없습니다"
          hint="장소를 방문하고 리뷰를 남겨보세요!"
          actionLabel="지도에서 장소 찾아보기"
          onAction={() => router.navigate('/')}
        />
      ) : (
        <FlatList
          data={reviews}
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
  placeName: { fontSize: 15, fontWeight: '700' },
  content: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  date: { fontSize: 11 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
