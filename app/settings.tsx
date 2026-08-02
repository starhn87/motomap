import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

import { useAuthStore } from '@/stores/useAuthStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { deleteAccount } from '@/lib/api/account';
import { toast } from '@/lib/toast';

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


export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { mode, setMode } = useThemeStore();

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
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        테마
      </Text>
      <View style={styles.themeRow}>
        <ThemeOption label="시스템" value="system" current={mode} onPress={setMode} />
        <ThemeOption label="라이트" value="light" current={mode} onPress={setMode} />
        <ThemeOption label="다크" value="dark" current={mode} onPress={setMode} />
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
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
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
