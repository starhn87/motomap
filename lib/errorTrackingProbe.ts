import { captureHandledException } from '@/lib/errorTracking';

function isDevBuild(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

/**
 * 프로덕션 번들에는 화면·시작 경로에서 호출하지 않는다.
 * 개발 빌드이면서 EXPO_PUBLIC_ERROR_TRACKING_PROBE=1 일 때만 핸들된 JS 예외를 보낸다.
 * 네이티브 크래시는 여기서 일으키지 않는다.
 */
export function errorTrackingProbeAllowed(): boolean {
  return isDevBuild() && process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE === '1';
}

export function runHandledErrorProbe(): void {
  if (!errorTrackingProbeAllowed()) {
    throw new Error('Error tracking probe is not available.');
  }
  captureHandledException(new Error('motomap handled error probe'), { area: 'error_tracking_probe' });
}
