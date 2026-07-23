import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useState } from 'react';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  FadeInDown,
} from 'react-native-reanimated';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { pickImage, uploadImage } from '@/lib/uploadImage';
import { updateAvatarUrl } from '@/lib/nickname';
import { toast } from '@/lib/toast';
import LoginPrompt from '@/components/auth/LoginPrompt';
import ImageViewer from '@/components/ui/ImageViewer';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ReactNode;
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
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.menuIcon}>{icon}</View>
      <Text
        style={[
          styles.menuLabel,
          { color: danger ? semantic.danger : colors.text },
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user.user_metadata?.avatar_url ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  // 뷰어에서 골랐지만 아직 적용하지 않은 사진 — 뷰어 안 미리보기로만 보인다
  const [pendingUri, setPendingUri] = useState<string | null>(null);

  const displayName = user.user_metadata?.name
    ?? user.user_metadata?.full_name
    ?? user.email
    ?? '라이더';

  const handleChangeAvatar = async () => {
    const uri = await pickImage();
    if (!uri) return;

    setUploading(true);
    try {
      const url = await uploadImage(uri, `avatars/${user.id}`);
      await updateAvatarUrl(url);
      setAvatarUrl(url);
    } catch (error: any) {
      toast.error('프로필 사진 변경에 실패했습니다.', error.message);
    } finally {
      setUploading(false);
    }
  };

  // 뷰어를 닫지 않고 피커를 띄운다 — 닫는 애니메이션과 피커 프레젠트가
  // 경합하면 iOS가 피커를 조용히 무산시킨다.
  const handlePickForViewer = async () => {
    const uri = await pickImage();
    if (uri) setPendingUri(uri);
  };

  const handleApplyPending = async () => {
    if (!pendingUri) return;
    const uri = pendingUri;
    setUploading(true);
    try {
      const url = await uploadImage(uri, `avatars/${user.id}`);
      await updateAvatarUrl(url);
      setAvatarUrl(url);
      setPendingUri(null);
      setAvatarViewerOpen(false);
      toast.success('프로필 사진을 변경했어요.');
    } catch (error: any) {
      toast.error('프로필 사진 변경에 실패했습니다.', error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.profileHeader}>
        {/* 아바타 어디를 눌러도 확대 보기로 통일 — 변경은 뷰어 하단 버튼에서.
            뱃지는 터치 타깃이 아니라 "바꿀 수 있음"을 알리는 힌트다. */}
        <Pressable
          onPress={avatarUrl ? () => setAvatarViewerOpen(true) : handleChangeAvatar}
          disabled={uploading}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
              <Text style={[styles.avatarText, { color: colors.background }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            {uploading ? <Text style={styles.avatarBadgeText}>...</Text> : <Ionicons name="camera" size={15} color="#18181B" />}
          </View>
        </Pressable>
        <Text style={[styles.name, { color: colors.text }]}>
          {displayName}
        </Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>
          {user.email}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.menu}>
        <MenuItem icon={<Ionicons name="create-outline" size={20} color={colors.text} />} label="닉네임 변경" onPress={() => router.push('/edit-nickname')} />
        <MenuItem icon={<Image source={require('@/assets/images/bike-silhouette.png')} style={{ width: 26, height: 15 }} tintColor={colors.text} contentFit="contain" />} label="내 바이크" onPress={() => router.push('/edit-bike')} />
        <MenuItem icon={<Ionicons name="star-outline" size={20} color={colors.text} />} label="즐겨찾기" onPress={() => router.push('/favorites')} />
        <MenuItem icon={<Ionicons name="document-text-outline" size={20} color={colors.text} />} label="내 제보 목록" onPress={() => router.push('/my-submissions')} />
        <MenuItem icon={<Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />} label="내 리뷰" onPress={() => router.push('/my-reviews')} />
        <MenuItem
          icon={<Ionicons name="log-out-outline" size={20} color={colors.text} />}
          label="로그아웃"
          onPress={handleSignOut}
          danger
        />
      </Animated.View>

      {avatarUrl && (
        <ImageViewer
          visible={avatarViewerOpen}
          photos={[pendingUri ?? avatarUrl]}
          onClose={() => {
            setAvatarViewerOpen(false);
            setPendingUri(null);
          }}
          renderFooter={() =>
            pendingUri ? (
              <View style={styles.viewerFooterRow}>
                <Pressable
                  onPress={() => setPendingUri(null)}
                  disabled={uploading}
                  style={({ pressed }) => [styles.viewerChangeButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={styles.viewerChangeText}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleApplyPending()}
                  disabled={uploading}
                  style={({ pressed }) => [styles.viewerApplyButton, { opacity: pressed ? 0.8 : 1 }]}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#18181B" />
                  ) : (
                    <Text style={styles.viewerApplyText}>적용</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void handlePickForViewer()}
                style={({ pressed }) => [styles.viewerChangeButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
                <Text style={styles.viewerChangeText}>사진 변경</Text>
              </Pressable>
            )
          }
        />
      )}
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
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <Ionicons name="settings-outline" size={22} color={colors.text} />
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
    gap: 6,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  viewerChangeButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  viewerChangeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerFooterRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 10,
  },
  viewerApplyButton: {
    minWidth: 88,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  viewerApplyText: {
    color: '#18181B',
    fontSize: 14,
    fontWeight: '700',
  },
  avatarBadgeText: {
    fontSize: 14,
  },
  avatarText: {
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
    width: 26,
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
