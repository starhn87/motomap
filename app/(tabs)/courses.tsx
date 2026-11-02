import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import Colors, { semantic } from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { withNativeTabScreen } from '@/components/navigation/NativeTabScreen';
import { TabScrollSpacer } from '@/components/navigation/tabOcclusion';
import { useSharedGeneralPlaces } from '@/hooks/useCommunityPlaceSignals';
import type { GeneralPlace } from '@/lib/api/generalPlaces';
import { fetchAllPlaces } from '@/lib/api/places';
import { looksLikeGasStation } from '@/lib/api/gasStations';
import { rankRecommendedPlaces, rankReviewedPlaces, displayedRating } from '@/lib/exploreRankings';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import type { Place } from '@/types';

type Board = 'recommended' | 'rated';
type RankingItem = { kind: 'general'; place: GeneralPlace; rank: number }
  | { kind: 'registered'; place: Place; rank: number };
const BOARDS: { key: Board; label: string }[] = [
  { key: 'recommended', label: '추천순' },
  { key: 'rated', label: '평점순' },
];

function PlaceRankingRow({ item }: { item: RankingItem }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { place, rank } = item;
  const registered = item.kind === 'registered';
  const count = registered ? item.place.reviewCount : item.place.shareCount;
  const metric = registered ? `평점 ${displayedRating(place.rating).toFixed(1)}, 리뷰 ${count}개` : `추천 ${count}명`;
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${rank}위, ${place.name}, ${metric}, ${registered ? '등록 장소' : '일반 장소'}`}
      onPress={() => {
        if (item.kind === 'registered') focusPlaceOnMap(place.id, { source: 'explore', place: item.place });
        else focusPointOnMap({ ...item.place, generalPlaceId: item.place.id });
      }}
      style={({ pressed }) => [styles.rankRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.rank, { color: rank <= 3 ? colors.text : colors.textSecondary }]}>{rank}</Text>
      <View style={styles.placeBody}>
        <Text style={[styles.placeName, { color: colors.text }]} numberOfLines={2}>{place.name}</Text>
        <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>{place.address}</Text>
        {item.kind === 'registered' && <View style={styles.categoryRow}>
          <CategoryIcon category={item.place.category} size={12} color={colors.textSecondary} />
          <Text style={[styles.categoryText, { color: colors.textSecondary }]}>{CATEGORIES[item.place.category].label}</Text>
        </View>}
      </View>
      <View style={styles.metric}>
        <View style={styles.metricValue}>
          <Ionicons name={registered ? 'star' : 'checkmark'} size={13} color={registered ? semantic.star : colors.textSecondary} />
          <Text style={[styles.metricText, { color: colors.text }]}>{registered ? displayedRating(place.rating).toFixed(1) : count}</Text>
        </View>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{registered ? `리뷰 ${count}개` : '추천'}</Text>
      </View>
    </Pressable>
  );
}

function RankingSkeleton() {
  return <View>{Array.from({ length: 6 }, (_, index) => (
    <View key={index} style={styles.rankRow}>
      <Skeleton width={22} height={18} radius={4} />
      <View style={styles.placeBody}><Skeleton width="70%" height={19} /><Skeleton width="90%" height={13} style={{ marginTop: 8 }} /></View>
      <Skeleton width={42} height={30} />
    </View>
  ))}</View>;
}

function ExploreScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [board, setBoard] = useState<Board>('recommended');
  const [visibleCount, setVisibleCount] = useState(10);
  const listRef = useRef<FlatList<RankingItem>>(null);
  const shared = useSharedGeneralPlaces(null, board === 'recommended');
  const registered = useQuery({ queryKey: ['places', 'all', null], queryFn: () => fetchAllPlaces(null), enabled: board === 'rated' });
  const query = board === 'recommended' ? shared : registered;
  const items: RankingItem[] = board === 'recommended'
    ? rankRecommendedPlaces((shared.data ?? []).filter(place => !looksLikeGasStation(place.name))).map(item => ({ kind: 'general', ...item }))
    : rankReviewedPlaces(registered.data ?? []).map(item => ({ kind: 'registered', ...item }));
  return (
    <FlatList ref={listRef} style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.list}
      data={query.isLoading ? [] : items.slice(0, visibleCount)}
      keyExtractor={item => `${item.kind}-${item.place.id}`}
      renderItem={({ item }) => <PlaceRankingRow item={item} />}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.tint} />}
      ListHeaderComponent={<>
        <View style={[styles.boards, { borderBottomColor: colors.border }]}>
          {BOARDS.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: board === item.key }}
            onPress={() => { setBoard(item.key); setVisibleCount(10); listRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
            style={({ pressed }) => [styles.board, { borderBottomColor: board === item.key ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.boardLabel, { color: board === item.key ? colors.text : colors.textSecondary }]}>{item.label}</Text>
          </Pressable>)}
        </View>
        {query.isError && <View style={[styles.error, { borderColor: colors.border }]}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{items.length ? '목록을 새로 불러오지 못했어요. 이전 결과예요.' : '목록을 불러오지 못했어요.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="탐색 목록 다시 불러오기" disabled={query.isFetching}
            accessibilityState={{ disabled: query.isFetching, busy: query.isFetching }} onPress={() => { void query.refetch(); }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 12 })}>
            <Text style={{ color: colors.text, opacity: query.isFetching ? 0 : 1 }}>다시 시도</Text>
            {query.isFetching && <ActivityIndicator color={colors.tint} style={StyleSheet.absoluteFill} />}
          </Pressable>
        </View>}
      </>}
      ListEmptyComponent={query.isLoading ? <RankingSkeleton /> : query.isError ? null : <EmptyState
        title={board === 'recommended' ? '아직 추천된 장소가 없어요' : '아직 리뷰가 쌓이지 않았어요'}
        hint={board === 'recommended' ? '좋았던 일반 장소에서 장소 추천하기를 눌러보세요.' : '리뷰가 남겨진 등록 장소부터 보여드려요.'}
        actionLabel="지도에서 찾아보기"
        onAction={() => router.navigate('/')}
      />}
      ListFooterComponent={<>
        {items.length > visibleCount && <Pressable accessibilityRole="button" onPress={() => setVisibleCount(count => count + 10)}
        style={({ pressed }) => [styles.more, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ color: colors.text }}>더 보기</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" onPress={() => router.push('/recommended-places')}
          style={({ pressed }) => [styles.more, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={{ color: colors.text }}>맞춤 추천·새 장소 둘러보기</Text>
        </Pressable>
        <TabScrollSpacer />
      </>}
    />
  );
}

export default withNativeTabScreen(ExploreScreen, { title: '탐색' });

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  boards: { flexDirection: 'row', gap: 20, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  board: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, marginBottom: -StyleSheet.hairlineWidth },
  boardLabel: { fontSize: 16, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 28, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  placeBody: { flex: 1, gap: 3 }, placeName: { fontSize: 16, lineHeight: 22, fontWeight: '600' }, address: { fontSize: 12, lineHeight: 17 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }, categoryText: { fontSize: 12 },
  metric: { minWidth: 44, alignItems: 'flex-end', gap: 1 }, metricValue: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricText: { fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] }, metricLabel: { fontSize: 11, lineHeight: 14 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, marginTop: 20 },
  error: { marginTop: 16, paddingHorizontal: 12, paddingTop: 12, borderWidth: 1, borderRadius: 10 }, errorText: { fontSize: 13, lineHeight: 19 },
});
