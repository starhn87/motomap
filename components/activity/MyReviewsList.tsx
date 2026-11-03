import Ionicons from '@expo/vector-icons/Ionicons';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import { fetchMyReviews, MY_REVIEWS_PAGE_SIZE, type MyReview } from '@/lib/api/mydata';
import { useAuthStore } from '@/stores/useAuthStore';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import StarRating from '@/components/review/StarRating';
import PhotoStrip from '@/components/map/PhotoStrip';
import { useTabOcclusion } from '@/components/navigation/tabOcclusion';
import { useContentHeaderInset } from '@/components/navigation/headerInset';
import { useTrackHeaderScroll } from '@/components/navigation/headerScroll';
import SwipeDeleteRow from './SwipeDeleteRow';
import { useDeleteActivityReview } from '@/hooks/useActivityActions';

function ReviewSkeletonList() {
  const headerInset = useContentHeaderInset();
  return (
    <View style={[styles.list, { paddingTop: headerInset + 16 }]}>
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

export default function MyReviewsList({ active = true }: { active?: boolean }) {
  const headerInset = useContentHeaderInset();
  const deletion = useDeleteActivityReview();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const bottomInset = useTabOcclusion();
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['my-reviews', user?.id],
    queryFn: ({ pageParam }) => fetchMyReviews(pageParam),
    enabled: !!user && active,
    initialPageParam: 0,
    // 마지막 페이지가 꽉 차 있으면 다음 페이지가 더 있을 수 있다
    getNextPageParam: (last, all) =>
      last.length === MY_REVIEWS_PAGE_SIZE ? all.length : undefined,
  });
  const reviews = data?.pages.flat();
  const trackHeaderScroll = useTrackHeaderScroll(active, { hasContent: !!reviews?.length });

  // 탭하면 지도의 해당 장소 시트가 펼쳐지고 이 리뷰로 스크롤·강조된다
  const renderItem = ({ item }: { item: MyReview }) => (
    <SwipeDeleteRow label="리뷰 삭제" message="이 리뷰와 첨부 사진을 장소 상세에서도 삭제할까요?" busy={deletion.isPending}
      onDelete={() => { if (user) deletion.mutate({ review: item, userId: user.id }); }}>
    {confirmDelete =>
    <Pressable
      accessibilityActions={[{ name: 'delete', label: '리뷰 삭제' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') confirmDelete(); }}
      onPress={() => {
        if (item.targetKind === 'place') {
          focusPlaceOnMap(item.placeId, { reviewId: item.id, source: 'favorite' });
        } else if (item.generalPlace) {
          focusPointOnMap(item.generalPlace);
        }
      }}
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
      {item.photos?.length ? (
        <View style={styles.cardPhotos}>
          <PhotoStrip
            items={item.photos.map((url: string) => ({ url }))}
            size={84}
          />
        </View>
      ) : null}
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
      </Text>
    </Pressable>}
    </SwipeDeleteRow>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ReviewSkeletonList />
      ) : isError && !reviews?.length ? (
        <EmptyState title="리뷰를 불러오지 못했어요" hint="연결 상태를 확인하고 다시 시도해 주세요."
          actionLabel="다시 시도" onAction={() => { void refetch(); }} />
      ) : !reviews?.length ? (
        <EmptyState
          icon={<Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.textSecondary} />}
          title="작성한 리뷰가 없습니다"
          hint="장소를 방문하고 리뷰를 남겨보세요!"
          actionLabel="지도에서 장소 찾아보기"
          onAction={() => router.navigate('/')}
        />
      ) : (
        <FlatList
          onScroll={trackHeaderScroll} scrollEventThrottle={16}
          data={reviews}
          ListHeaderComponent={isError ? <Text style={{ color: colors.textSecondary }}>새로 불러오지 못해 이전 리뷰를 보여줘요.</Text> : null}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingTop: headerInset + 16, paddingBottom: 16 + bottomInset }]}
          scrollIndicatorInsets={{ top: headerInset }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.tint}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (active && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator
                size="small"
                color={colors.tint}
                style={styles.footerSpinner}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footerSpinner: { paddingVertical: 16 },
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
  cardPhotos: { marginBottom: 10 },
  date: { fontSize: 11 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
