import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Linking,
  ScrollView,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useThemeStore } from '@/stores/useThemeStore';
import { useNavPrefStore, type NavAppId } from '@/stores/useNavPrefStore';
import { NAV_APPS, getAvailableNavApps } from '@/lib/navigation';

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
            ? '#F97316'
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#F3F4F6',
          borderColor: isActive ? '#F97316' : colors.border,
        },
      ]}>
      <Text
        style={[
          styles.themeLabel,
          { color: isActive ? '#FFFFFF' : colors.text },
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
            ? '#F97316'
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#F9FAFB',
          borderColor: selected ? '#F97316' : colors.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      <Text
        style={[
          styles.navAppLabel,
          { color: selected ? '#FFFFFF' : colors.text },
        ]}>
        {label}
      </Text>
      {disabled ? (
        <Text style={[styles.navAppBadge, { color: colors.textSecondary }]}>
          미설치
        </Text>
      ) : selected ? (
        <Text style={styles.navAppCheck}>✓</Text>
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { mode, setMode } = useThemeStore();
  const { defaultApp, setDefaultApp } = useNavPrefStore();
  const [availableIds, setAvailableIds] = useState<Set<NavAppId>>(new Set());

  useEffect(() => {
    getAvailableNavApps().then((apps) => {
      setAvailableIds(new Set(apps.map((a) => a.id)));
    });
  }, []);

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
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>버전</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>1.0.0</Text>
        </View>
      </View>

      <Pressable
        onPress={() => Linking.openURL('https://realman.notion.site/RideMap-34520de7c8198070909bf4ab9813ee98')}
        style={[
          styles.linkButton,
          {
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.linkText, { color: colors.text }]}>개인정보처리방침</Text>
        <Text style={[styles.linkArrow, { color: colors.textSecondary }]}>›</Text>
      </Pressable>
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
    color: '#FFFFFF',
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
