import FontAwesome from '@expo/vector-icons/FontAwesome';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { registerGuideEvents } from '@/lib/guideEvents';
import { checkStartupNotices } from '@/lib/updateCheck';
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
import DialogHost from '@/components/ui/DialogHost';
import PendingAccountLinkPrompt from '@/components/auth/PendingAccountLinkPrompt';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useMapStore } from '@/stores/useMapStore';
import { useHapticsStore } from '@/stores/useHapticsStore';
import { registerPushToken, setupNotificationTapHandling } from '@/lib/push';
import { PostHogProvider } from 'posthog-react-native';

import { posthog, useScreenTracking } from '@/lib/analytics';
import { getAppReleaseContext } from '@/lib/appVersion';
import { getKakaoNaviCapabilities } from '@/modules/kakao-navi';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const nativeCapabilities = getKakaoNaviCapabilities();
const releaseContext = getAppReleaseContext(nativeCapabilities.bridgeVersion);
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // 개발 빌드는 보내지 않는다 — Metro 번들 로드가 메인 스레드를 수 초 잡아
    // AppHang 노이즈가 실이슈처럼 쌓인다(실측: dev 이벤트가 다수).
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

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts(FontAwesome.font);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const initialize = useAuthStore((s) => s.initialize);
  const loadMode = useThemeStore((s) => s.loadMode);

  // 길안내 전역 이벤트 — 안내 중에는 /navi 화면이 지도로 빠져 언마운트되므로
  // 종료(도착 리뷰 제안)·메뉴(위험 제보 등) 처리는 루트에서 상시 구독한다.
  useEffect(() => registerGuideEvents(), []);

  // 스토어 업데이트 또는 현재 버전의 새로운 기능을 안내한다. 첫 화면(지도) 로딩과
  // 겹치지 않게 잠시 미루고, 둘 다 대상이면 업데이트 안내만 우선해서 띄운다.
  useEffect(() => {
    const t = setTimeout(() => void checkStartupNotices(), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    initialize();
    loadMode();
    void useHapticsStore.getState().load();
    void useMapStore.getState().loadShowFavorites();
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
      // KNSDK 는 여기서 초기화하지 않는다 — 초기화가 백그라운드 위치 구독을
      // 켜서, 길안내를 안 해도 앱이 백그라운드에서 계속 GPS 를 받는다(실측:
      // locationd 로그, 밤새 배터리 소모 사례). 내비 진입 시 lazy 초기화
      // (lib/kakaoNaviInit.ts) — 내비를 안 쓴 세션은 SDK 위치가 아예 안 켜진다.
    }
  }, [initialize, loadMode]);

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
  // 상단 토스트가 노치·Dynamic Island 에 붙지 않게 — 라이브러리 기본(40)은 고정값이라
  // 기기별 안전 영역을 못 따라간다
  const insets = useSafeAreaInsets();

  // 알림 탭 → 해당 장소/코스로 이동 (Stack 마운트 이후 등록해야 내비게이션이 안전)
  useEffect(() => setupNotificationTapHandling(), []);
  // expo-router 는 화면 자동 수집이 안 돼 경로를 직접 구독한다(lib/analytics 주석)
  useScreenTracking();

  const tree = (
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
            {/* freezeOnBlur 금지: 검색 등이 위에 떠 있는 동안에도 지도 탭이
                화면 복귀 이벤트와 대기 중인 장소 포커스 요청을 받아야 한다 */}
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
            <Stack.Screen
              name="navi"
              options={{ headerShown: false, animation: 'fade' }}
            />
            <Stack.Screen name="place-preview" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
      <Toast config={toastConfig} topOffset={insets.top + 8} />
      <PendingAccountLinkPrompt />
      <DialogHost />
    </GestureHandlerRootView>
  );

  // 키가 없으면 클라이언트가 null 이라 Provider 없이 그대로 렌더한다 —
  // 계측 미설정이 앱 동작에 영향을 주지 않아야 한다.
  if (!posthog) return tree;
  // 화면·터치 자동 수집은 끈다. 화면은 useScreenTracking 이 직접 보내고,
  // 터치 전수는 퍼널에 안 걸리는 노이즈다(docs/analytics-events.md).
  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: false }}>
      {tree}
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
