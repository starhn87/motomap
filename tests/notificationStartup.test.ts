import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import type { ResumeStartupOutcome } from '../lib/serviceResumeNotification';

async function startup(outcomes: ResumeStartupOutcome[]) {
  const stages: string[] = [];
  const effects: (() => unknown)[] = [];
  let checks = 0;
  let downloads = 0;
  let reloads = 0;
  const { default: RootLayout } = loadModule<{ default: () => unknown }>('app/_layout.tsx', {
    'expo-splash-screen': { preventAutoHideAsync() {}, setOptions() {}, hide() {} },
    'expo-updates': { channel: 'production', checkForUpdateAsync: async () => { checks++; return { isAvailable: true }; },
      fetchUpdateAsync: async () => { downloads++; return { isNew: true }; }, reloadAsync: async () => { reloads++; } },
    'react': { lazy: () => 'Lazy', Suspense: 'Suspense',
      useState: (initial: unknown) => [initial, (value: unknown) => { if (typeof value === 'string') stages.push(value); }],
      useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => unknown) => effects.push(effect) },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-native': { View: 'View' }, 'expo-router': {},
    '@/components/ServiceLoadingScreen': {}, '@/components/ServiceResumeScreen': {}, '@/components/ServiceSuspendedScreen': {},
    '@/constants/app': { APP_STORE_URL: 'https://apps.apple.com/kr/app/id6773636183' },
    '@/lib/appVersion': { getInstalledAppVersion: () => '1.2.8' },
    '@/lib/serviceStatus': { fetchServiceStatus: async () => ({}), resolveServiceGate: () => 'check-update' },
    '@/lib/startupSplash': { scheduleStartupSplashHide() {}, STARTUP_SPLASH_FADE_MS: 180 },
    '@/lib/setupServiceResumeNotification': { setupResumeStoreLink: () => ({ dispose() {}, settleStartup: async () => outcomes.shift() ?? 'none' }) },
  }, { __DEV__: false, performance: { now: () => 0 } });
  RootLayout();
  const cleanup = effects[0]() as () => void;
  await new Promise((resolve) => setTimeout(resolve, 10));
  cleanup();
  return { stages, checks, downloads, reloads };
}

test('콜드 승인 탭은 OTA 확인·재시작 없이 상세 요청을 활성 앱에 넘긴다', async () => {
  const result = await startup(['navigation']);
  assert.equal(result.stages.at(-1), 'active');
  assert.equal(result.checks, 0);
  assert.equal(result.reloads, 0);
});

test('OTA 다운로드 중 들어온 승인 탭도 reload로 잃지 않는다', async () => {
  const result = await startup(['none', 'navigation']);
  assert.equal(result.stages.at(-1), 'active');
  assert.equal(result.downloads, 1);
  assert.equal(result.reloads, 0);
});

test('알림이 없는 정상 실행은 기존 OTA 다운로드·재시작을 유지한다', async () => {
  const result = await startup(['none', 'none']);
  assert.equal(result.downloads, 1);
  assert.equal(result.reloads, 1);
});
