import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { Image as RNImage } from 'expo-image';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useBlockedUsers, useUnblockUser } from '@/hooks/useBlocks';
import { toast } from '@/lib/toast';
import Skeleton, { SkeletonContainer } from '@/components/ui/Skeleton';
import type { BlockedUser } from '@/lib/api/blocks';
import EmptyState from '@/components/ui/EmptyState';

function BlockedSkeletonList() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonContainer key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <Skeleton width={40} height={40} radius={20} />
          <Skeleton width="40%" height={16} style={{ flex: 1 }} />
          <Skeleton width={60} height={32} radius={8} />
        </SkeletonContainer>
      ))}
    </View>
  );
}

export default function BlockedUsersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: blocked, isLoading, refetch, isRefetching } = useBlockedUsers();
  const { mutateAsync: unblock } = useUnblockUser();

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      '차단 해제',
      `${user.nickname}님의 차단을 해제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          onPress: async () => {
            try {
              await unblock(user.userId);
            } catch (error: any) {
              toast.error('해제에 실패했습니다.', error.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: BlockedUser }) => (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}>
      {item.avatarUrl ? (
        <RNImage source={{ uri: item.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.tint }]}>
          <Text style={[styles.avatarText, { color: colors.background }]}>
            {item.nickname.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={[styles.nickname, { color: colors.text }]}>{item.nickname}</Text>
      <Pressable
        onPress={() => handleUnblock(item)}
        style={({ pressed }) => [
          styles.unblockButton,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[styles.unblockText, { color: colors.text }]}>해제</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <BlockedSkeletonList />
      ) : !blocked?.length ? (
        <EmptyState icon="🛡️" title="차단한 사용자가 없습니다" />
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  nickname: { flex: 1, fontSize: 15, fontWeight: '600' },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  unblockText: { fontSize: 13, fontWeight: '600' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: { fontSize: 14 },
});
