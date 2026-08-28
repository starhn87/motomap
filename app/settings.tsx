import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppUpdate } from '@/hooks/useAppUpdate';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

import { useAuthStore } from '@/stores/useAuthStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { deleteAccount } from '@/lib/api/account';
import { toast } from '@/lib/toast';
import { appAlert } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { SocialLoginProvider } from '@/lib/socialAuth';
import { useHapticsStore } from '@/stores/useHapticsStore';
import { haptics } from '@/lib/haptics';

type ThemeMode = 'system' | 'light' | 'dark';

const LOGIN_METHODS: { provider: SocialLoginProvider; identity: string; label: string }[] = [
  { provider: 'apple', identity: 'apple', label: 'Apple' },
  { provider: 'kakao', identity: 'kakao', label: '카카오' },
  { provider: 'naver', identity: 'custom:naver', label: '네이버' },
  { provider: 'google', identity: 'google', label: 'Google' },
];

function ThemeOption({
  label,
  value,
  current,
  onPress,
}: {
  label: string;
  value: ThemeMode;
  current: ThemeMode;
  onPress: (v: ThemeMode) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isActive = current === value;

  return (
    <Pressable
      onPress={() => onPress(value)}
      style={[
        styles.themeOption,
        {
          backgroundColor: isActive
            ? colors.tint
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#F3F4F6',
          borderColor: isActive ? colors.tint : colors.border,
        },
      ]}>
      <Text
        style={[
          styles.themeLabel,
          { color: isActive ? colors.background : colors.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LoginMethods({ initialProviders }: { initialProviders: string[] }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [identities, setIdentities] = useState<Set<string>>(() => new Set(initialProviders));
  const [linking, setLinking] = useState<SocialLoginProvider | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    setIdentities(new Set(data.user?.identities?.map((identity) => identity.provider) ?? []));
  };

  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  const handleLink = async (provider: SocialLoginProvider) => {
    setLinking(provider);
    try {
      const { linkSocialProvider } = await import('@/lib/socialAuth');
      const completed = await linkSocialProvider(provider);
      if (!completed) return;
      await refresh();
      toast.success('로그인 수단을 연결했어요.');
    } catch (error) {
      toast.error('로그인 수단을 연결하지 못했습니다.', (error as Error).message);
    } finally {
      setLinking(null);
    }
  };

  const methods = Platform.OS === 'ios'
    ? LOGIN_METHODS
    : LOGIN_METHODS.filter((method) => method.provider !== 'apple');

  return (
    <View style={[styles.loginMethodsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {identities.has('email') ? (
        <View style={[styles.loginMethodRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.loginMethodLabel, { color: colors.text }]}>이메일</Text>
          <View style={styles.linkedState}>
            <Ionicons name="checkmark-circle" size={17} color={semantic.success} />
            <Text style={[styles.loginMethodState, { color: colors.textSecondary }]}>연결됨</Text>
          </View>
        </View>
      ) : null}
      {methods.map((method, index) => {
        const connected = identities.has(method.identity);
        const isLoading = linking === method.provider;
        return (
          <View
            key={method.provider}
            style={[
              styles.loginMethodRow,
              { borderBottomColor: colors.border },
              index === methods.length - 1 && styles.lastLoginMethodRow,
            ]}>
            <Text style={[styles.loginMethodLabel, { color: colors.text }]}>{method.label}</Text>
            {connected ? (
              <View style={styles.linkedState}>
                <Ionicons name="checkmark-circle" size={17} color={semantic.success} />
                <Text style={[styles.loginMethodState, { color: colors.textSecondary }]}>연결됨</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={linking !== null}
                onPress={() => void handleLink(method.provider)}
                style={({ pressed }) => [
                  styles.linkMethodButton,
                  { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 },
                ]}>
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={[styles.linkMethodText, { color: colors.text }]}>연결</Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}


export default function SettingsScreen() {
  const { current, hasUpdate, openStore } = useAppUpdate();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { mode, setMode } = useThemeStore();
  const hapticsEnabled = useHapticsStore((state) => state.enabled);
  const setHapticsEnabled = useHapticsStore((state) => state.setEnabled);

  const handleHapticsChange = (enabled: boolean) => {
    if (hapticsEnabled) haptics.selection();
    void setHapticsEnabled(enabled);
    if (enabled) haptics.success();
  };

  const handleDeleteAccount = () => {
    appAlert(
      '회원 탈퇴',
      '탈퇴 시 계정 정보가 익명 처리되며, 프로필 사진과 닉네임이 제거됩니다.\n\n작성하신 리뷰와 제보는 유지될 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: () => {
            appAlert(
              '정말 탈퇴하시겠습니까?',
              '이 작업은 되돌릴 수 없습니다.',
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '탈퇴',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      router.replace('/');
                    } catch (e: any) {
                      toast.error('탈퇴 처리에 실패했습니다.', e?.message);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>사용 환경</Text>
      <Text style={[styles.environmentLabel, { color: colors.text }]}>테마</Text>
      <View style={styles.themeRow}>
        <ThemeOption label="시스템" value="system" current={mode} onPress={setMode} />
        <ThemeOption label="라이트" value="light" current={mode} onPress={setMode} />
        <ThemeOption label="다크" value="dark" current={mode} onPress={setMode} />
      </View>

      <View
        style={[styles.settingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.settingText}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>햅틱 피드백</Text>
          <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>버튼과 지도 선택의 진동 반응</Text>
          <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
            켜면 바로 테스트해요. 기기의 시스템 햅틱이 꺼져 있으면 동작하지 않아요.
          </Text>
        </View>
        <View style={styles.settingSwitchSlot}>
          <Switch
            accessibilityLabel="햅틱 피드백"
            value={hapticsEnabled}
            onValueChange={handleHapticsChange}
            trackColor={{ false: colors.border, true: semantic.success }}
          />
        </View>
      </View>

      {user ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>로그인 수단</Text>
          <LoginMethods
            initialProviders={user.identities?.map((identity) => identity.provider) ?? []}
          />
        </>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        앱 정보
      </Text>
      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        {/* 새 버전이 있으면 행 자체가 스토어로 가는 버튼이 된다. 앱 시작 안내는
            checkStartupNotices 가 버전마다 한 번만 담당하고, 이 행은 이후에도
            사용자가 직접 업데이트할 수 있는 진입점으로 남긴다. */}
        <Pressable
          onPress={hasUpdate ? openStore : undefined}
          disabled={!hasUpdate}
          style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>버전</Text>
          <View style={styles.versionValue}>
            <Text style={[styles.infoValue, { color: colors.text }]}>{current}</Text>
            {hasUpdate && (
              <>
                <Text style={[styles.updateBadge, { color: colors.tint }]}>업데이트 있음</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.tint} />
              </>
            )}
          </View>
        </Pressable>
      </View>

      {user && (
        <Pressable
          onPress={() => router.push('/blocked-users' as any)}
          style={[
            styles.linkButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <Text style={[styles.linkText, { color: colors.text }]}>차단 관리</Text>
          <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>
        약관 및 정책
      </Text>
      <Pressable
        onPress={() => router.push('/legal/terms' as any)}
        style={[
          styles.linkButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.linkText, { color: colors.text }]}>서비스 이용약관</Text>
        <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/legal/privacy' as any)}
        style={[
          styles.linkButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.linkText, { color: colors.text }]}>개인정보 처리방침</Text>
        <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/legal/location' as any)}
        style={[
          styles.linkButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.linkText, { color: colors.text }]}>위치기반 서비스 이용약관</Text>
        <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
      </Pressable>

      {user && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>
            계정
          </Text>
          <Pressable
            onPress={handleDeleteAccount}
            style={[
              styles.linkButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <Text style={[styles.linkText, { color: semantic.danger }]}>회원 탈퇴</Text>
            <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  environmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  loginMethodsCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 32,
    overflow: 'hidden',
  },
  settingCard: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingText: {
    flex: 1,
    marginRight: 12,
  },
  settingSwitchSlot: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 3,
  },
  settingHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 5,
  },
  loginMethodRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastLoginMethodRow: {
    borderBottomWidth: 0,
  },
  loginMethodLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkedState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  loginMethodState: {
    fontSize: 13,
  },
  linkMethodButton: {
    minWidth: 54,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkMethodText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  versionValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  updateBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  linkButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkArrow: {
    fontSize: 18,
    fontWeight: '600',
  },
});
