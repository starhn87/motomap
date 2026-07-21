import FontAwesome from '@expo/vector-icons/FontAwesome';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { Pressable, View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { queryClient } from '@/lib/queryClient';
import { toastConfig } from '@/components/ui/toastConfig';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNavPrefStore } from '@/stores/useNavPrefStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { registerPushToken, setupNotificationTapHandling } from '@/lib/push';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enableAutoSessionTracking: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    environment: __DEV__ ? 'development' : 'production',
  });
}

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const initialize = useAuthStore((s) => s.initialize);
  const loadDefaultApp = useNavPrefStore((s) => s.loadDefaultApp);
  const loadMode = useThemeStore((s) => s.loadMode);

  useEffect(() => {
    initialize();
    loadDefaultApp();
    loadMode();
    // 이미 권한이 허용된 기기만 조용히 토큰 갱신(로테이션 대응). 권한 요청은
    // 제보 직후(submit)에만 — 맥락 없는 첫 실행 권한 팝업을 피한다.
    void registerPushToken(false);
    const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey as
      | string
      | undefined;
    if (appKey) {
      initializeKakaoSDK(appKey).catch((err) => {
        console.warn('Failed to initialize Kakao SDK', err);
      });
    }
  }, [initialize, loadDefaultApp, loadMode]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

// iOS 26 네이티브 헤더는 버튼 슬롯을 유리 캡슐로 감싼다(커스텀 headerLeft 도 예외
// 없음) — 헤더를 통째로 직접 그려서 화살표만 남긴다.
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

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  // 알림 탭 → 해당 장소/코스로 이동 (Stack 마운트 이후 등록해야 내비게이션이 안전)
  useEffect(() => setupNotificationTapHandling(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ title: '알림' }} />
            <Stack.Screen name="settings" options={{ title: '설정' }} />
            <Stack.Screen name="edit-nickname" options={{ title: '닉네임 변경' }} />
            <Stack.Screen name="edit-bike" options={{ title: '내 바이크' }} />
            <Stack.Screen name="favorites" options={{ title: '즐겨찾기' }} />
            <Stack.Screen name="my-submissions" options={{ title: '내 제보 목록' }} />
            <Stack.Screen name="my-reviews" options={{ title: '내 리뷰' }} />
            <Stack.Screen name="blocked-users" options={{ title: '차단 관리' }} />
            <Stack.Screen name="legal/[type]" options={{}} />
            <Stack.Screen name="course/[id]" options={{ title: '코스 상세' }} />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
      <Toast config={toastConfig} />
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
