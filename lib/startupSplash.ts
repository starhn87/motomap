export const STARTUP_SPLASH_MIN_MS = 500;
export const STARTUP_SPLASH_FADE_MS = 180;

// 화면 준비와 최소 노출 시간을 겹친다. 느린 시작에 0.5초를 다시 더하지 않는다.
export function scheduleStartupSplashHide(startedAt: number, hide: () => void) {
  const remaining = Math.max(0, STARTUP_SPLASH_MIN_MS - (performance.now() - startedAt));
  const timer = setTimeout(hide, remaining);
  return () => clearTimeout(timer);
}
