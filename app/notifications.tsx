import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useNotifications, useMarkAllRead } from '@/hooks/useNotifications';
import EmptyState from '@/components/ui/EmptyState';
import HighlightPulse from '@/components/ui/HighlightPulse';
import type { AppNotification } from '@/lib/api/notifications';

// "3분 전", "2시간 전", "5일 전", 그 이상은 날짜
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function NotificationsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markAllRead } = useMarkAllRead();
  const markedRef = useRef(false);

  // 반려 푸시 탭 → 해당 알림으로 스크롤·강조 (highlightTs 는 같은 알림 재탭용 nonce)
  const { highlightId, highlightTs } = useLocalSearchParams<{
    highlightId?: string;
    highlightTs?: string;
  }>();
  const highlightKey = highlightId ? `${highlightId}-${highlightTs ?? ''}` : null;
  const listRef = useRef<FlatList<AppNotification>>(null);
  const scrolledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightKey || !highlightId || !notifications?.length) return;
    if (scrolledKeyRef.current === highlightKey) return;
    const index = notifications.findIndex((n) => n.id === highlightId);
    if (index < 0) return;
    scrolledKeyRef.current = highlightKey;
    // 목록 첫 렌더가 끝난 뒤 스크롤 — 강조(delay 800ms)는 스크롤이 멎을 즈음 시작된다
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true });
    }, 350);
    return () => clearTimeout(t);
  }, [highlightKey, highlightId, notifications]);

  // 화면에 들어오면 전부 읽음 처리 (뱃지 해소) — 목록의 안읽음 점은 이번 렌더 동안 유지
  useEffect(() => {
    if (markedRef.current) return;
    if (notifications?.some((n) => !n.readAt)) {
      markedRef.current = true;
      markAllRead();
    }
  }, [notifications, markAllRead]);

  const handlePress = (item: AppNotification) => {
    if (item.data?.placeId) {
      router.navigate({
        pathname: '/',
        params: { focusPlaceId: item.data.placeId, focusTs: String(Date.now()) },
      });
    } else if (item.data?.courseId) {
      router.push(`/course/${item.data.courseId}`);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!notifications?.length ? (
        <EmptyState
          icon="🔔"
          title="아직 알림이 없습니다"
          hint="제보하신 장소나 코스가 반영되면 여기서 알려드려요."
          actionLabel="제보하러 가기"
          onAction={() => router.navigate('/submit')}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={(info) => {
            // 가변 높이 카드라 미측정 구간은 근사 오프셋으로 이동 후 재시도
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: info.index,
                viewPosition: 0.2,
                animated: true,
              });
            }, 350);
          }}
          renderItem={({ item }) => (
            <HighlightPulse
              pulseKey={item.id === highlightId ? (highlightKey ?? undefined) : undefined}
              delay={800}
              tint={colors.tint}
              borderRadius={14}>
              <Pressable
                onPress={() => handlePress(item)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <View style={styles.itemIcon}>
                  {item.type === 'feedback_reply' ? (
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.tint} />
                  ) : item.type.startsWith('course') ? (
                    <MaterialCommunityIcons name="road-variant" size={20} color={colors.tint} />
                  ) : (
                    <Ionicons name="location-outline" size={20} color={colors.tint} />
                  )}
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    {!item.readAt && <View style={[styles.unreadDot, { backgroundColor: colors.tint }]} />}
                  </View>
                  {/* 알림 목록이 본문 전문을 볼 수 있는 유일한 곳 — 말줄임 없이 그대로 보여준다 */}
                  <Text style={[styles.itemText, { color: colors.textSecondary }]}>
                    {item.body}
                  </Text>
                  <Text style={[styles.itemTime, { color: colors.textSecondary }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </Pressable>
            </HighlightPulse>
          )}
        />
      )}
    </View>
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
  list: {
    padding: 16,
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  itemIcon: {
    width: 26,
    alignItems: 'center',
    marginTop: 2,
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 19,
  },
  itemTime: {
    fontSize: 11,
    marginTop: 2,
  },
});
