import Ionicons from '@expo/vector-icons/Ionicons';
import CategoryIcon from '@/components/ui/CategoryIcon';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import EmptyState from '@/components/ui/EmptyState';

import Colors, { semantic } from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import {
  fetchMySubmissions,
  type MySubmission,
} from '@/lib/api/mydata';
import { fetchMyFeedback, type MyFeedback, type FeedbackType } from '@/lib/api/feedback';
import { focusPlaceOnMap } from '@/lib/mapFocus';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import { useTabOcclusion } from '@/components/navigation/tabOcclusion';
import { useContentHeaderInset } from '@/components/navigation/headerInset';
import { useTrackHeaderScroll } from '@/components/navigation/headerScroll';
import HeaderBackdrop from '@/components/ui/HeaderBackdrop';
import SwipeDeleteRow from './SwipeDeleteRow';
import { useActivityDismissals, useDismissSubmission } from '@/hooks/useActivityActions';

const FEEDBACK_LABEL: Record<FeedbackType, string> = {
  bug: '버그 신고',
  feature: '기능 건의',
  general: '기타 의견',
};

function SubmissionSkeletonList({ segmentHeight = 52 }: { segmentHeight?: number }) {
  const headerInset = useContentHeaderInset();
  return (
    <View style={[styles.list, { paddingTop: headerInset + segmentHeight + 16 }]}>
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

export default function MySubmissionsList({ active = true }: { active?: boolean }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const bottomInset = useTabOcclusion();
  const [tab, setTab] = useState<'places' | 'feedback'>('places');
  const [segmentHeight, setSegmentHeight] = useState(52);
  const headerInset = useContentHeaderInset();
  const dismissals = useActivityDismissals(active);
  const dismissal = useDismissSubmission();

  const { data: allPlaces, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-submissions', user?.id],
    queryFn: fetchMySubmissions,
    enabled: !!user && active && tab === 'places',
  });

  const {
    data: allFeedback,
    isLoading: feedbackLoading,
    isError: feedbackError,
    refetch: refetchFeedback,
    isRefetching: feedbackRefetching,
  } = useQuery({
    queryKey: ['my-feedback', user?.id],
    queryFn: fetchMyFeedback,
    enabled: !!user && active && tab === 'feedback',
  });

  const places = allPlaces?.filter(row => !dismissals.data?.some(hidden => hidden.kind === 'place_submission' && hidden.target_id === row.id));
  const feedback = allFeedback?.filter(row => !dismissals.data?.some(hidden => hidden.kind === 'feedback' && hidden.target_id === row.id));
  const trackHeaderScroll = useTrackHeaderScroll(active, { resetKey: tab, hasContent: !!(tab === 'places' ? places : feedback)?.length });

  const renderItem = ({ item }: { item: MySubmission }) => {
    const category = CATEGORIES[item.category];
    const status = item.rejected
      ? { label: '반려됨', color: semantic.danger }
      : item.approved
        ? { label: '승인됨', color: semantic.success }
        : { label: '대기중', color: '#71717A' };

    return (
      <SwipeDeleteRow label="제보 목록에서 삭제" message="내 목록에서만 숨겨요. 제보 내용과 검토·승인 결과는 그대로 유지돼요." busy={dismissal.isPending}
        onDelete={() => { if (user) dismissal.mutate({ userId: user.id, kind: 'place_submission', id: item.id }); }}>
      {confirmDelete =>
      <Pressable
        accessibilityActions={[{ name: 'delete', label: '제보 목록에서 삭제' }]}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') confirmDelete(); }}
        onPress={() => {
          if (item.rejected) {
            toast.info('반려된 제보예요', item.rejectedReason ?? undefined);
          } else if (item.approved) {
            // 지도의 장소 시트로 — 리뷰·상세가 그 안에 있다
            focusPlaceOnMap(item.id, { source: 'submission' });
          } else {
            toast.info('아직 검토 중인 제보예요', '승인되면 지도에서 볼 수 있어요.');
          }
        }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '20' }]}>
            <CategoryIcon category={item.category} size={14} color={category.color} />
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={[styles.placeName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.placeAddress, { color: colors.textSecondary }]}>
          {item.address}
        </Text>
        {item.rejected && !!item.rejectedReason && (
          <View
            style={[
              styles.replyBox,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}>
            <Text style={[styles.replyLabel, { color: colors.textSecondary }]}>반려 사유</Text>
            <Text style={[styles.replyText, { color: colors.text }]}>{item.rejectedReason}</Text>
          </View>
        )}
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {new Date(item.createdAt).toLocaleDateString('ko-KR')}
        </Text>
      </Pressable>}
      </SwipeDeleteRow>
    );
  };

  const renderFeedback = ({ item }: { item: MyFeedback }) => (
    <SwipeDeleteRow label="건의 목록에서 삭제" message="내 목록에서만 숨겨요. 보낸 내용과 답변은 보존돼요." busy={dismissal.isPending}
      onDelete={() => { if (user) dismissal.mutate({ userId: user.id, kind: 'feedback', id: item.id }); }}>
    {confirmDelete =>
    <View
      accessible accessibilityActions={[{ name: 'delete', label: '건의 목록에서 삭제' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') confirmDelete(); }}
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <View style={styles.cardHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: `${colors.tint}18` }]}>
          <Text style={[styles.categoryLabel, { color: colors.tint }]}>
            {FEEDBACK_LABEL[item.type] ?? '의견'}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: item.reply ? `${semantic.success}20` : '#71717A20' },
          ]}>
          <Text
            style={[
              styles.statusText,
              { color: item.reply ? semantic.success : '#71717A' },
            ]}>
            {item.reply ? '답변 완료' : '답변 대기'}
          </Text>
        </View>
      </View>
      <Text style={[styles.feedbackContent, { color: colors.text }]}>{item.content}</Text>
      {!!item.reply && (
        <View
          style={[
            styles.replyBox,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}>
          <Text style={[styles.replyLabel, { color: colors.textSecondary }]}>모토맵 답변</Text>
          <Text style={[styles.replyText, { color: colors.text }]}>{item.reply}</Text>
        </View>
      )}
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
      </Text>
    </View>}
    </SwipeDeleteRow>
  );

  const showLoading =
    (tab === 'places' ? isLoading : feedbackLoading) || dismissals.isLoading;
  const failed = (tab === 'places' ? isError : feedbackError) || dismissals.isError;
  const retry = () => { void dismissals.refetch(); return tab === 'places' ? refetch() : refetchFeedback(); };
  const hasItems = dismissals.isError && !dismissals.data ? 0 : (tab === 'places' ? places : feedback)?.length;
  const listStyle = [styles.list, { paddingTop: headerInset + segmentHeight + 16, paddingBottom: 16 + bottomInset }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>


      {failed && !!hasItems && <Text style={{ color: colors.textSecondary, paddingHorizontal: 16, marginTop: 8, fontSize: 13 }}>
        새로 불러오지 못해 이전 목록을 보여줘요.
      </Text>}
      {showLoading ? (
        <SubmissionSkeletonList segmentHeight={segmentHeight} />
      ) : failed && !hasItems ? (
        <EmptyState title="제보 목록을 불러오지 못했어요" hint="연결 상태를 확인하고 다시 시도해 주세요."
          actionLabel="다시 시도" onAction={() => { void retry(); }} />
      ) : tab === 'places' ? (
        !places?.length ? (
          <EmptyState
            icon={<Ionicons name="location-outline" size={44} color={colors.textSecondary} />}
            title="제보한 장소가 없습니다"
            actionLabel="제보하러 가기"
            onAction={() => router.navigate('/submit')}
          />
        ) : (
          <FlatList
            key="places"
            onScroll={trackHeaderScroll} scrollEventThrottle={16}
            data={places}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={listStyle}
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
      ) : !feedback?.length ? (
        <EmptyState
          icon={
            <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.textSecondary} />
          }
          title="보낸 건의가 없습니다"
          actionLabel="건의하러 가기"
          onAction={() => router.navigate('/submit')}
        />
      ) : (
        <FlatList
          key="feedback"
          onScroll={trackHeaderScroll} scrollEventThrottle={16}
          data={feedback}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedback}
          contentContainerStyle={listStyle}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feedbackRefetching}
              onRefresh={refetchFeedback}
              tintColor={colors.tint}
            />
          }
        />
      )}
      <View style={[styles.segmentRow, { top: headerInset }]} onLayout={event => setSegmentHeight(event.nativeEvent.layout.height)}><HeaderBackdrop />
        {(
          [
            ['places', '장소'],
            ['feedback', '건의'],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={({ pressed }) => [
                styles.segment,
                {
                  backgroundColor: active ? colors.tint : colors.surfaceMuted,
                  borderColor: active ? colors.tint : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.segmentLabel,
                  { color: active ? colors.background : colors.text },
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentRow: {
    position: 'absolute', left: 0, right: 0, zIndex: 5, overflow: 'hidden',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryLabel: { fontSize: 11, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  placeName: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  placeAddress: { fontSize: 13, marginBottom: 4 },
  proposalReason: { fontSize: 13, lineHeight: 19, marginBottom: 5 },
  feedbackContent: { fontSize: 15, lineHeight: 21, marginBottom: 8 },
  replyBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 8,
  },
  replyLabel: { fontSize: 11, fontWeight: '700' },
  replyText: { fontSize: 14, lineHeight: 20 },
  date: { fontSize: 11 },
});
