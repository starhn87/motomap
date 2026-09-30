import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import ServiceLoadingScreen from '@/components/ServiceLoadingScreen';
import ServiceResumeScreen from '@/components/ServiceResumeScreen';
import ServiceSuspendedScreen from '@/components/ServiceSuspendedScreen';
import { APP_STORE_URL } from '@/constants/app';
import { getInstalledAppVersion } from '@/lib/appVersion';
import { fetchServiceStatus, resolveServiceGate } from '@/lib/serviceStatus';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

// 중단 화면에서는 이 모듈을 평가하지 않는다. 지도·인증·분석은 진입 후에만 시작한다.
const ActiveRootLayout = lazy(() => import('@/components/ActiveRootLayout'));

type GateStage = 'checking' | 'suspended' | 'preparing' | 'update' | 'retry' | 'active';

export default function RootLayout() {
  const [stage, setStage] = useState<GateStage>('checking');
  const [storeUrl, setStoreUrl] = useState(APP_STORE_URL);
  const requestSequence = useRef(0);

  async function checkStatus() {
    const requestId = ++requestSequence.current;
    setStage('checking');
    const status = await fetchServiceStatus();
    if (requestId !== requestSequence.current) return;
    if (status) setStoreUrl(status.storeUrl);
    const gate = resolveServiceGate(
      status,
      getInstalledAppVersion(),
      Updates.channel === 'internal-testflight',
    );
    if (gate !== 'check-update') {
      setStage(gate);
      return;
    }

    // 개발 서버는 expo-updates 확인 API가 지원되지 않는다.
    if (__DEV__) {
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
          setStage('retry');
          return;
        }
        await Updates.reloadAsync();
        return;
      }
      setStage('active');
    } catch {
      if (requestId === requestSequence.current) setStage('retry');
    }
  }

  useEffect(() => {
    void SplashScreen.hideAsync();
    void checkStatus();
    return () => {
      requestSequence.current += 1;
    };
  }, []);

  if (stage === 'active') {
    return (
      <Suspense fallback={<ServiceLoadingScreen />}>
        <ActiveRootLayout />
      </Suspense>
    );
  }

  if (stage === 'checking') return <ServiceLoadingScreen />;

  if (stage === 'update' || stage === 'retry') {
    return (
      <ServiceResumeScreen
        mode={stage}
        onRetry={() => void checkStatus()}
        storeUrl={storeUrl}
      />
    );
  }

  return (
    <ServiceSuspendedScreen
      preparing={stage === 'preparing'}
      onCheckStatus={() => void checkStatus()}
    />
  );
}
