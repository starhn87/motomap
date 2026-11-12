import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import ServiceLoadingScreen from '@/components/ServiceLoadingScreen';
import ServiceResumeScreen from '@/components/ServiceResumeScreen';
import { APP_STORE_URL } from '@/constants/app';
import { getInstalledAppVersion } from '@/lib/appVersion';
import { fetchServiceStatus, resolveServiceGate } from '@/lib/serviceStatus';
import { scheduleStartupSplashHide, STARTUP_SPLASH_FADE_MS } from '@/lib/startupSplash';
import { setupResumeStoreLink } from '@/lib/setupServiceResumeNotification';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: STARTUP_SPLASH_FADE_MS });

// 최소 버전 확인 뒤에 지도·인증·분석을 시작한다.
const ActiveRootLayout = lazy(() => import('@/components/ActiveRootLayout'));

type GateStage = 'checking' | 'update' | 'active';

export default function RootLayout() {
  const [stage, setStage] = useState<GateStage>('checking');
  const [storeUrl, setStoreUrl] = useState(APP_STORE_URL);
  const requestSequence = useRef(0);
  const resumeController = useRef<ReturnType<typeof setupResumeStoreLink> | null>(null);
  const startupStartedAt = useRef(performance.now());
  const splashHidden = useRef(false);
  const [startupReady, setStartupReady] = useState(false);

  async function checkStatus() {
    const requestId = ++requestSequence.current;
    setStage('checking');
    const status = await fetchServiceStatus();
    if (requestId !== requestSequence.current) return;
    if (status) setStoreUrl(status.storeUrl);
    const gate = resolveServiceGate(status, getInstalledAppVersion());
    if (gate !== 'check-update') {
      setStage(gate);
      return;
    }

    // 알림의 비동기 조회·저장을 끝내기 전에 OTA로 native emitter를 교체하지 않는다.
    const resumeOutcome = await resumeController.current?.settleStartup();
    if (requestId !== requestSequence.current) return;
    if (resumeOutcome && resumeOutcome !== 'none') {
      // 알림 탭 처리 결과를 OTA 재시작이나 업데이트 화면으로 덮지 않는다.
      setStage('active');
      return;
    }

    // 상태 조회에 실패하면 OTA까지 기다리지 않고 설치된 지원 버전으로 시작한다.
    if (!status || __DEV__) {
      setStage('active');
      return;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (requestId !== requestSequence.current) return;
      if (update.isAvailable) {
        const downloaded = await Updates.fetchUpdateAsync();
        if (requestId !== requestSequence.current) return;
        if (!downloaded.isNew) {
          setStage('active');
          return;
        }
        // 다운로드 중에도 새 알림을 탭할 수 있다. 직전 응답을 다시 정리한다.
        const lateResumeOutcome = await resumeController.current?.settleStartup();
        if (requestId !== requestSequence.current) return;
        if (lateResumeOutcome && lateResumeOutcome !== 'none') {
          setStage('active');
          return;
        }
        await Updates.reloadAsync();
        return;
      }
      setStage('active');
    } catch {
      if (requestId === requestSequence.current) setStage('active');
    }
  }

  useEffect(() => {
    const controller = setupResumeStoreLink();
    resumeController.current = controller;
    void checkStatus();
    return () => {
      controller.dispose();
      resumeController.current = null;
      requestSequence.current += 1;
      // 오류 경계 등으로 루트가 사라지면 안내 화면을 스플래시로 가리지 않는다.
      SplashScreen.hide();
    };
  }, []);

  useEffect(() => {
    if (!startupReady || stage === 'checking' || splashHidden.current) return;
    return scheduleStartupSplashHide(startupStartedAt.current, () => {
      splashHidden.current = true;
      SplashScreen.hide();
    });
  }, [stage, startupReady]);

  let content;
  if (stage === 'active') {
    content = (
      <Suspense fallback={<ServiceLoadingScreen />}>
        <ActiveRootLayout onReady={() => setStartupReady(true)} />
      </Suspense>
    );
  } else if (stage === 'checking') {
    content = <ServiceLoadingScreen />;
  } else {
    content = <ServiceResumeScreen storeUrl={storeUrl} />;
  }

  return (
    <View
      key={stage}
      style={{ flex: 1 }}
      onLayout={stage !== 'checking' && stage !== 'active' ? () => setStartupReady(true) : undefined}>
      {content}
    </View>
  );
}
