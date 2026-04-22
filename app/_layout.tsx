import FontAwesome from '@expo/vector-icons/FontAwesome';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNavPrefStore } from '@/stores/useNavPrefStore';
import { useThemeStore } from '@/stores/useThemeStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
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

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: '설정', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="edit-nickname" options={{ title: '닉네임 변경', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="favorites" options={{ title: '즐겨찾기', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="my-submissions" options={{ title: '내 제보 목록', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="my-reviews" options={{ title: '내 리뷰', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="blocked-users" options={{ title: '차단 관리', headerBackTitle: '뒤로' }} />
            <Stack.Screen name="legal/[type]" options={{ headerBackTitle: '뒤로' }} />
            <Stack.Screen name="course/[id]" options={{ title: '코스 상세', headerBackTitle: '뒤로' }} />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
