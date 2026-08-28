import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import ServiceSuspendedScreen from '@/components/ServiceSuspendedScreen';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

// 사업자 등록 및 위치기반서비스 관련 절차를 정비하는 동안 서비스 모듈을
// 아예 import하지 않는다. 재개 조건은 docs/domain-decisions/service-suspension.md.
export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return <ServiceSuspendedScreen />;
}
