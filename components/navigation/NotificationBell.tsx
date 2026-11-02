import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUnreadCount } from '@/hooks/useNotifications';

// 네이티브·기존 탭 모두 같은 알림 진입과 미읽음 표시를 사용한다.
export default function NotificationBell() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const user = useAuthStore(state => state.user);
  const unreadCount = useUnreadCount();
  if (!user) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'}
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name="notifications-outline" size={20} color={colors.text} />
      {unreadCount > 0 && <View style={styles.badge}>
        <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4, backgroundColor: semantic.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
