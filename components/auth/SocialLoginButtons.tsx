import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { LoginProvider } from '@/lib/recentLogin';
import type { SocialLoginProvider } from '@/lib/socialAuth';
import { toast } from '@/lib/toast';

// Apple 네이티브 버튼의 시각 규격에 맞춰 나머지 공급자도 같은 크기로 보이게 한다.
const PROVIDER_ICON_SIZE = 18;
const PROVIDER_LABEL_SIZE = 17;

const PROVIDERS: {
  provider: SocialLoginProvider;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  mark?: string;
  backgroundColor: string;
  textColor: string;
  border: boolean;
}[] = [
  {
    provider: 'kakao',
    label: '카카오로 로그인',
    icon: 'chatbubble',
    backgroundColor: '#FEE500',
    textColor: '#191919',
    border: false,
  },
  {
    provider: 'naver',
    label: '네이버로 로그인',
    mark: 'N',
    backgroundColor: '#03C75A',
    textColor: '#FFFFFF',
    border: false,
  },
  {
    provider: 'google',
    label: 'Google로 로그인',
    icon: 'logo-google',
    backgroundColor: '#FFFFFF',
    textColor: '#18181B',
    border: true,
  },
];

export function RecentLoginBadge() {
  return (
    <View pointerEvents="none" style={styles.recentBadge}>
      <Text style={styles.recentBadgeText}>최근 사용</Text>
    </View>
  );
}

export default function SocialLoginButtons({
  recentProvider,
}: {
  recentProvider: LoginProvider | null;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [loadingProvider, setLoadingProvider] = useState<SocialLoginProvider | null>(null);
  const appleBackgroundColor = colorScheme === 'dark' ? '#FFFFFF' : '#000000';
  const appleTextColor = colorScheme === 'dark' ? '#000000' : '#FFFFFF';

  const handleLogin = async (provider: SocialLoginProvider) => {
    setLoadingProvider(provider);
    try {
      const { signInWithSocialProvider } = await import('@/lib/socialAuth');
      await signInWithSocialProvider(provider);
    } catch (error) {
      toast.error('로그인에 실패했습니다.', (error as Error).message);
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <View style={styles.buttonWrapper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apple로 로그인"
            disabled={loadingProvider !== null}
            onPress={() => void handleLogin('apple')}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: appleBackgroundColor,
                borderColor: appleBackgroundColor,
                opacity: loadingProvider !== null && loadingProvider !== 'apple'
                  ? 0.55
                  : pressed ? 0.82 : 1,
              },
            ]}>
            {loadingProvider === 'apple' ? (
              <ActivityIndicator size="small" color={appleTextColor} />
            ) : (
              <View style={styles.providerContent}>
                <Image
                  source={require('@/assets/images/apple-logo.svg')}
                  style={styles.providerIcon}
                  tintColor={appleTextColor}
                />
                <Text style={[styles.buttonText, { color: appleTextColor }]}>Apple로 로그인</Text>
              </View>
            )}
          </Pressable>
          {recentProvider === 'apple' ? <RecentLoginBadge /> : null}
        </View>
      ) : null}

      {PROVIDERS.map((item) => {
        const loading = loadingProvider === item.provider;
        const disabled = loadingProvider !== null;
        const backgroundColor = item.provider === 'google' && colorScheme === 'dark'
          ? colors.surface
          : item.backgroundColor;
        const textColor = item.provider === 'google' && colorScheme === 'dark'
          ? colors.text
          : item.textColor;

        return (
          <View key={item.provider} style={styles.buttonWrapper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              disabled={disabled}
              onPress={() => void handleLogin(item.provider)}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor,
                  borderColor: item.border ? colors.border : backgroundColor,
                  opacity: disabled && !loading ? 0.55 : pressed ? 0.82 : 1,
                },
              ]}>
              {loading ? (
                <ActivityIndicator size="small" color={textColor} />
              ) : (
                <View style={styles.providerContent}>
                  <View style={styles.iconArea}>
                    {item.icon ? (
                      <Ionicons name={item.icon} size={PROVIDER_ICON_SIZE} color={textColor} />
                    ) : (
                      <Text style={[styles.providerMark, { color: textColor }]}>{item.mark}</Text>
                    )}
                  </View>
                  <Text style={[styles.buttonText, { color: textColor }]}>{item.label}</Text>
                </View>
              )}
            </Pressable>
            {recentProvider === item.provider ? <RecentLoginBadge /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  buttonWrapper: {
    position: 'relative',
  },
  button: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconArea: {
    width: PROVIDER_ICON_SIZE,
    height: PROVIDER_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  providerIcon: {
    width: PROVIDER_ICON_SIZE,
    height: PROVIDER_ICON_SIZE,
  },
  providerMark: {
    fontSize: PROVIDER_ICON_SIZE,
    lineHeight: PROVIDER_ICON_SIZE,
    fontWeight: '900',
  },
  buttonText: {
    fontSize: PROVIDER_LABEL_SIZE,
    fontWeight: '600',
  },
  recentBadge: {
    position: 'absolute',
    right: 10,
    top: -7,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  recentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
