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
import { useSharedGeneralPlaces } from '@/hooks/useCommunityPlaceSignals';
import { useRidingGuides } from '@/hooks/useRidingGuides';
import type { GeneralPlace } from '@/lib/api/generalPlaces';
import { fetchAllPlaces } from '@/lib/api/places';
import { looksLikeGasStation } from '@/lib/api/gasStations';
import { rankRecommendedPlaces, rankReviewedPlaces, displayedRating } from '@/lib/exploreRankings';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import type { Place, RidingGuide } from '@/types';

type Board = 'recommended' | 'rated' | 'riding';
type RankingItem = { kind: 'general'; place: GeneralPlace; rank: number }
  | { kind: 'registered'; place: Place; rank: number } | { kind: 'riding'; guide: RidingGuide };
const BOARDS: { key: Board; label: string; title: string; description: string }[] = [
  { key: 'recommended', label: '추천순', title: '추천 많이 받은 곳', description: '일반 장소 · 전국 누적 추천수 기준' },
  { key: 'rated', label: '평점순', title: '평점 높은 바이크 장소', description: '등록 장소 · 리뷰 평점 기준 · 같은 평점은 공동 순위' },
  { key: 'riding', label: '라이딩 추천', title: '다음 라이딩의 목적지', description: '여러 장소를 엮은 라이딩 추천' },
];

function PlaceRankingRow({ item }: { item: Exclude<RankingItem, { kind: 'riding' }> }) {
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
          <Ionicons name={registered ? 'star' : 'checkmark'} size={15} color={registered ? semantic.star : colors.text} />
          <Text style={[styles.metricText, { color: colors.text }]}>{registered ? displayedRating(place.rating).toFixed(1) : count}</Text>
        </View>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{registered ? `리뷰 ${count}개` : '추천'}</Text>
      </View>
    </Pressable>
  );
}

function RidingGuideRow({ guide }: { guide: RidingGuide }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const primary = guide.stops.find(stop => stop.role === 'primary');
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/riding/${guide.id}`)}
      style={({ pressed }) => [styles.guideRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.placeName, { color: colors.text }]} numberOfLines={2}>{guide.title}</Text>
      <Text style={[styles.guideSummary, { color: colors.textSecondary }]} numberOfLines={2}>{guide.summary}</Text>
      <View style={styles.guideMeta}>
        <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
        <Text style={[styles.address, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{primary?.place.name ?? guide.regions.join(' · ')}</Text>
        <Text style={[styles.categoryText, { color: colors.textSecondary }]}>장소 {guide.stops.length}</Text>
      </View>
    </Pressable>
  );
}

function RankingSkeleton() {
  return <View>{Array.from({ length: 6 }, (_, index) => (
    <View key={index} style={styles.rankRow}>
      <Skeleton width={28} height={28} />
      <View style={styles.placeBody}><Skeleton width="70%" height={19} /><Skeleton width="90%" height={13} style={{ marginTop: 8 }} /></View>
      <Skeleton width={42} height={30} />
    </View>
  ))}</View>;
}

export default function ExploreScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [board, setBoard] = useState<Board>('recommended');
  const [visibleCount, setVisibleCount] = useState(10);
  const listRef = useRef<FlatList<RankingItem>>(null);
  const shared = useSharedGeneralPlaces(null, board === 'recommended');
  const registered = useQuery({ queryKey: ['places', 'all', null], queryFn: () => fetchAllPlaces(null), enabled: board === 'rated' });
  const guides = useRidingGuides(board === 'riding');
  const query = board === 'recommended' ? shared : board === 'rated' ? registered : guides;
  const definition = BOARDS.find(item => item.key === board)!;
  const items: RankingItem[] = board === 'recommended'
    ? rankRecommendedPlaces((shared.data ?? []).filter(place => !looksLikeGasStation(place.name))).map(item => ({ kind: 'general', ...item }))
    : board === 'rated' ? rankReviewedPlaces(registered.data ?? []).map(item => ({ kind: 'registered', ...item }))
      : (guides.data ?? []).map(guide => ({ kind: 'riding', guide }));
  return (
    <FlatList ref={listRef} style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.list}
      data={query.isLoading ? [] : items.slice(0, visibleCount)}
      keyExtractor={item => item.kind === 'riding' ? `guide-${item.guide.id}` : `${item.kind}-${item.place.id}`}
      renderItem={({ item }) => item.kind === 'riding' ? <RidingGuideRow guide={item.guide} /> : <PlaceRankingRow item={item} />}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.tint} />}
      ListHeaderComponent={<>
        <Text style={[styles.heading, { color: colors.text }]}>{definition.title}</Text>
        <View style={[styles.boards, { borderBottomColor: colors.border }]}>
          {BOARDS.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: board === item.key }}
            onPress={() => { setBoard(item.key); setVisibleCount(10); listRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
            style={({ pressed }) => [styles.board, { borderBottomColor: board === item.key ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.boardLabel, { color: board === item.key ? colors.text : colors.textSecondary }]}>{item.label}</Text>
          </Pressable>)}
        </View>
        <Text style={[styles.criteria, { color: colors.textSecondary }]}>{definition.description}</Text>
        {board === 'recommended' && <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>바이크 특화 장소는 아니지만, 라이더가 가볼 만한 곳으로 추천해요.</Text>}
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
        title={board === 'recommended' ? '아직 추천된 장소가 없어요' : board === 'rated' ? '아직 리뷰가 쌓이지 않았어요' : '라이딩 추천을 준비하고 있어요'}
        hint={board === 'recommended' ? '좋았던 일반 장소에서 장소 추천하기를 눌러보세요.' : board === 'rated' ? '리뷰가 남겨진 등록 장소부터 보여드려요.' : '좋았던 목적지를 라이더들과 나눠보세요.'}
        actionLabel={board === 'riding' ? '라이딩 추천 보내기' : '지도에서 찾아보기'}
        onAction={() => board === 'riding'
          ? router.navigate({ pathname: '/submit', params: { submitType: 'riding', submitTs: String(Date.now()) } }) : router.navigate('/')}
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
      </>}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  boards: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16, marginBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  board: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2 }, boardLabel: { fontSize: 15, fontWeight: '600' },
  criteria: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 48, textAlign: 'center', fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  placeBody: { flex: 1, gap: 5 }, placeName: { fontSize: 17, lineHeight: 24, fontWeight: '600' }, address: { fontSize: 12, lineHeight: 18 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, categoryText: { fontSize: 12 },
  metric: { minWidth: 48, alignItems: 'flex-end', gap: 4 }, metricValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }, metricLabel: { fontSize: 11 },
  guideRow: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth }, guideSummary: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  guideMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, marginTop: 20 },
  error: { marginTop: 16, paddingHorizontal: 12, paddingTop: 12, borderWidth: 1, borderRadius: 10 }, errorText: { fontSize: 13, lineHeight: 19 },
});
