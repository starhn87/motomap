import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useNavPrefStore, type NavAppId } from '@/stores/useNavPrefStore';
import { NAV_APPS, getAvailableNavApps } from '@/lib/navigation';
import { deleteAccount } from '@/lib/api/account';

type ThemeMode = 'system' | 'light' | 'dark';

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

function NavAppRow({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.navAppRow,
        {
          backgroundColor: selected
            ? colors.tint
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#F9FAFB',
          borderColor: selected ? colors.tint : colors.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      <Text
        style={[
          styles.navAppLabel,
          { color: selected ? colors.background : colors.text },
        ]}>
        {label}
      </Text>
      {disabled ? (
        <Text style={[styles.navAppBadge, { color: colors.textSecondary }]}>
          미설치
        </Text>
      ) : selected ? (
        <Text style={[styles.navAppCheck, { color: colors.background }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { mode, setMode } = useThemeStore();
  const { defaultApp, setDefaultApp } = useNavPrefStore();
  const [availableIds, setAvailableIds] = useState<Set<NavAppId>>(new Set());

  useEffect(() => {
    getAvailableNavApps().then((apps) => {
      setAvailableIds(new Set(apps.map((a) => a.id)));
    });
  }, []);

  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴 시 계정 정보가 익명 처리되며, 프로필 사진과 닉네임이 제거됩니다.\n\n작성하신 리뷰와 제보는 유지될 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
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
                      Alert.alert('오류', e?.message ?? '탈퇴 처리에 실패했습니다.');
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
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        테마
      </Text>
      <View style={styles.themeRow}>
        <ThemeOption label="시스템" value="system" current={mode} onPress={setMode} />
        <ThemeOption label="라이트" value="light" current={mode} onPress={setMode} />
        <ThemeOption label="다크" value="dark" current={mode} onPress={setMode} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        기본 네비게이션
      </Text>
      <View style={styles.navAppList}>
        <NavAppRow
          label="매번 묻기"
          selected={defaultApp === null}
          onPress={() => setDefaultApp(null)}
        />
        {NAV_APPS.map((app) => (
          <NavAppRow
            key={app.id}
            label={app.label}
            selected={defaultApp === app.id}
            disabled={!availableIds.has(app.id)}
            onPress={() => setDefaultApp(app.id)}
          />
        ))}
      </View>

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
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>버전</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>1.0.0</Text>
        </View>
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
            <Text style={[styles.linkText, { color: '#EF4444' }]}>회원 탈퇴</Text>
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
    marginBottom: 32,
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
  navAppList: {
    gap: 8,
    marginBottom: 32,
  },
  navAppRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  navAppLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  navAppCheck: {
    fontSize: 16,
    fontWeight: '700',
  },
  navAppBadge: {
    fontSize: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
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
