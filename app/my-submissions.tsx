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
import { fetchMySubmissions, type MySubmission } from '@/lib/api/mydata';
import { fetchMyFeedback, type MyFeedback, type FeedbackType } from '@/lib/api/feedback';
import { focusPlaceOnMap } from '@/lib/mapFocus';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';

const FEEDBACK_LABEL: Record<FeedbackType, string> = {
  bug: '버그 신고',
  feature: '기능 건의',
  general: '기타 의견',
};

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
  const [tab, setTab] = useState<'places' | 'feedback'>('places');

  const { data: places, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-submissions', user?.id],
    queryFn: fetchMySubmissions,
  });

  const {
    data: feedback,
    isLoading: feedbackLoading,
    refetch: refetchFeedback,
    isRefetching: feedbackRefetching,
  } = useQuery({
    queryKey: ['my-feedback', user?.id],
    queryFn: fetchMyFeedback,
  });

  const renderItem = ({ item }: { item: MySubmission }) => {
    const category = CATEGORIES[item.category];
    const status = item.rejected
      ? { label: '반려됨', color: semantic.danger }
      : item.approved
        ? { label: '승인됨', color: semantic.success }
        : { label: '대기중', color: '#71717A' };

    return (
      <Pressable
        onPress={() => {
          if (item.rejected) {
            toast.info('반려된 제보예요', item.rejectedReason ?? undefined);
          } else if (item.approved) {
            // 지도의 장소 시트로 — 리뷰·상세가 그 안에 있다
            focusPlaceOnMap(item.id);
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
      </Pressable>
    );
  };

  const renderFeedback = ({ item }: { item: MyFeedback }) => (
    <View
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
    </View>
  );

  const showLoading = tab === 'places' ? isLoading : feedbackLoading;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.segmentRow}>
        {(
          [
            ['places', '장소 제보'],
            ['feedback', '건의'],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.tint : colors.surfaceMuted,
                  borderColor: active ? colors.tint : colors.border,
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

      {showLoading ? (
        <SubmissionSkeletonList />
      ) : tab === 'places' ? (
        !places?.length ? (
          <EmptyState
            icon={<Ionicons name="location-outline" size={44} color={colors.textSecondary} />}
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
        )
      ) : !feedback?.length ? (
        <EmptyState
          icon={
            <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.textSecondary} />
          }
          title="보낸 건의가 없습니다"
          hint="불편한 점이나 아이디어를 들려주세요. 답변도 여기서 볼 수 있어요."
          actionLabel="건의하러 가기"
          onAction={() => router.navigate('/submit')}
        />
      ) : (
        <FlatList
          data={feedback}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedback}
          contentContainerStyle={styles.list}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segment: {
    flex: 1,
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
