import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  FadeInDown,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import LoginPrompt from '@/components/auth/LoginPrompt';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97); }}
      onPressOut={() => { scale.value = withSpring(1); }}
      style={[
        styles.menuItem,
        animatedStyle,
        {
          backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
          borderColor: colors.border,
        },
      ]}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text
        style={[
          styles.menuLabel,
          { color: danger ? '#EF4444' : colors.text },
        ]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function LoggedInContent() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user)!;
  const signOut = useAuthStore((s) => s.signOut);

  const displayName = user.user_metadata?.name
    ?? user.user_metadata?.full_name
    ?? user.email
    ?? '라이더';

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>
          {displayName}
        </Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>
          {user.email}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.menu}>
        <MenuItem icon="✏️" label="닉네임 변경" onPress={() => router.push('/edit-nickname')} />
        <MenuItem icon="⭐" label="즐겨찾기" onPress={() => router.push('/favorites')} />
        <MenuItem icon="📝" label="내 제보 목록" onPress={() => router.push('/my-submissions')} />
        <MenuItem icon="💬" label="내 리뷰" onPress={() => router.push('/my-reviews')} />
        <MenuItem
          icon="🚪"
          label="로그아웃"
          onPress={handleSignOut}
          danger
        />
      </Animated.View>
    </>
  );
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 설정 버튼 - 항상 표시 */}
      <Pressable
        onPress={() => router.push('/settings')}
        style={[
          styles.settingsButton,
          {
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
            borderColor: colors.border,
          },
        ]}>
        <Text style={styles.settingsIcon}>⚙️</Text>
        <Text style={[styles.settingsLabel, { color: colors.text }]}>설정</Text>
      </Pressable>

      {user ? (
        <LoggedInContent />
      ) : (
        <LoginPrompt message="로그인하고 마이페이지를 확인하세요." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 20,
    marginRight: 16,
  },
  settingsIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  settingsLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
  },
  menu: {
    gap: 10,
    paddingHorizontal: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
