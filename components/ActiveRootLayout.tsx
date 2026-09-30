import { initializeKakaoSDK } from '@react-native-kakao/core';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { PostHogProvider } from 'posthog-react-native';

import PendingAccountLinkPrompt from '@/components/auth/PendingAccountLinkPrompt';
import PersonalPlaceRideSync from '@/components/PersonalPlaceRideSync';
import { useColorScheme } from '@/components/useColorScheme';
import DialogHost from '@/components/ui/DialogHost';
import { toastConfig } from '@/components/ui/toastConfig';
import Colors from '@/constants/Colors';
import { posthog, useScreenTracking } from '@/lib/analytics';
import { getAppReleaseContext } from '@/lib/appVersion';
import { registerGuideEvents } from '@/lib/guideEvents';
import { registerPushToken, setupNotificationTapHandling } from '@/lib/push';
import { queryClient } from '@/lib/queryClient';
import { checkStartupNotices } from '@/lib/updateCheck';
import { getKakaoNaviCapabilities } from '@/modules/kakao-navi';
import { useAuthStore } from '@/stores/useAuthStore';
import { useHapticsStore } from '@/stores/useHapticsStore';
import { useMapStore } from '@/stores/useMapStore';
import { useThemeStore } from '@/stores/useThemeStore';

// 이 모듈은 운영 상태가 active이고 버전·OTA 검사를 통과한 뒤에만 import한다.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const nativeCapabilities = getKakaoNaviCapabilities();
const releaseContext = getAppReleaseContext(nativeCapabilities.bridgeVersion);
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !__DEV__,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.2,
    environment: 'production',
  });
  Sentry.setTags({
    app_version: releaseContext.app_version,
    build_number: releaseContext.build_number,
    runtime_version: releaseContext.runtime_version,
    update_id: releaseContext.update_id,
    update_source: releaseContext.update_source,
    native_bridge_version: String(releaseContext.native_bridge_version),
    api_contract_version: String(releaseContext.api_contract_version),
  });
}

function AppHeader({ title, colorScheme }: { title: string; colorScheme: 'light' | 'dark' }) {
  const insets = useSafeAreaInsets();
  const colors = Colors[colorScheme];
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}>
      <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {router.canGoBack() && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ position: 'absolute', left: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        )}
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
      </View>
    </View>
  );
}

function ActiveRootLayoutNav() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  useEffect(() => setupNotificationTapHandling(), []);
  useScreenTracking();

  const tree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <PersonalPlaceRideSync />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              header: ({ options }) => (
                <AppHeader
                  title={typeof options.title === 'string' ? options.title : ''}
                  colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
                />
              ),
            }}>
            {/* 검색 위에서 돌아올 때도 지도가 포커스 요청을 받아야 한다. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false, freezeOnBlur: false }} />
            <Stack.Screen name="search" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="search-results" options={{ headerShown: false }} />
            <Stack.Screen name="directions" options={{ title: '길찾기' }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ title: '알림' }} />
            <Stack.Screen name="settings" options={{ title: '설정' }} />
            <Stack.Screen name="edit-nickname" options={{ title: '닉네임 변경' }} />
            <Stack.Screen name="edit-bike" options={{ title: '내 차고' }} />
            <Stack.Screen name="my-rides" options={{ title: '주행 기록' }} />
            <Stack.Screen name="favorites" options={{ title: '즐겨찾기' }} />
            <Stack.Screen name="my-submissions" options={{ title: '내 제보 목록' }} />
            <Stack.Screen name="my-reviews" options={{ title: '내 리뷰' }} />
            <Stack.Screen name="blocked-users" options={{ title: '차단 관리' }} />
            <Stack.Screen name="legal/[type]" options={{}} />
            <Stack.Screen name="course/[id]" options={{ title: '코스 상세' }} />
            <Stack.Screen name="riding/[id]" options={{ title: '라이딩 추천' }} />
            <Stack.Screen name="navi" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="place-preview" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
      <Toast config={toastConfig} topOffset={insets.top + 8} />
      <PendingAccountLinkPrompt />
      <DialogHost />
    </GestureHandlerRootView>
  );

  if (!posthog) return tree;
  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: false }}>
      {tree}
    </PostHogProvider>
  );
}

function ActiveRootLayout() {
  const [loaded, error] = useFonts(Ionicons.font);
  const initialize = useAuthStore((state) => state.initialize);
  const loadMode = useThemeStore((state) => state.loadMode);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => registerGuideEvents(), []);

  useEffect(() => {
    const timer = setTimeout(() => void checkStartupNotices(), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    initialize();
    loadMode();
    void useHapticsStore.getState().load();
    void useMapStore.getState().loadShowFavorites();
    void registerPushToken(false);
    const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey as string | undefined;
    if (appKey) {
      initializeKakaoSDK(appKey).catch((error) => {
        console.warn('Failed to initialize Kakao SDK', error);
      });
      // KNSDK 초기화는 길안내 진입 시 수행한다. 미사용 세션의 위치 구독을 막는다.
    }
  }, [initialize, loadMode]);

  if (!loaded) return null;
  return <ActiveRootLayoutNav />;
}

export default Sentry.wrap(ActiveRootLayout);
