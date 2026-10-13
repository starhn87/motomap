import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import type { ResumeStartupOutcome } from '../lib/serviceResumeNotification';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function rootFixture(settle: () => Promise<ResumeStartupOutcome>, available = false,
  download: () => Promise<{ isNew: boolean }> = async () => ({ isNew: true })) {
  const effects: Array<() => (() => void) | void> = [];
  const stages: string[] = [];
  let stateIndex = 0;
  let checks = 0;
  let downloads = 0;
  let reloads = 0;
  const controller = { settleStartup: settle, dispose() {} };
  const component = () => null;
  const { default: Root } = loadModule<{ default: () => unknown }>('app/_layout.tsx', {
    'react': {
      lazy: () => component, Suspense: component,
      useEffect: (effect: typeof effects[number]) => { effects.push(effect); },
      useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => {
        const index = stateIndex++;
        return [value, (next: string) => { if (index === 0) stages.push(next); }];
      },
    },
    'react/jsx-runtime': { jsx: component, jsxs: component },
    'react-native': { View: component },
    'expo-router': { ErrorBoundary: component },
    'expo-splash-screen': { preventAutoHideAsync() {}, setOptions() {}, hide() {} },
    'expo-updates': {
      channel: 'production',
      checkForUpdateAsync: async () => { checks++; return { isAvailable: available }; },
      fetchUpdateAsync: async () => { downloads++; return download(); },
      reloadAsync: async () => { reloads++; },
    },
    '@/components/ServiceLoadingScreen': component,
    '@/components/ServiceResumeScreen': component,
    '@/components/ServiceSuspendedScreen': component,
    '@/constants/app': { APP_STORE_URL: 'https://apps.apple.com/kr/app/id6773636183' },
    '@/lib/appVersion': { getInstalledAppVersion: () => '1.2.8' },
    '@/lib/serviceStatus': { fetchServiceStatus: async () => null, resolveServiceGate: () => 'check-update' },
    '@/lib/startupSplash': { STARTUP_SPLASH_FADE_MS: 180, scheduleStartupSplashHide() {} },
    '@/lib/setupServiceResumeNotification': { setupResumeStoreLink: () => controller },
  }, { __DEV__: false, performance: { now: () => 0 } });
  Root();
  const cleanup = effects[0]();
  return { stages, counts: () => ({ checks, downloads, reloads }), dispose: () => cleanup?.() };
}

test('루트는 알림 처리 완료 전에 OTA 확인·재시작으로 응답을 잃지 않는다', async () => {
  let finish: (value: ResumeStartupOutcome) => void = () => {};
  const pending = new Promise<ResumeStartupOutcome>((resolve) => { finish = resolve; });
  const root = rootFixture(() => pending, true);
  await flush();
  assert.deepEqual(root.counts(), { checks: 0, downloads: 0, reloads: 0 });
  finish('opened');
  await flush();
  assert.deepEqual(root.counts(), { checks: 0, downloads: 0, reloads: 0 });
  assert.equal(root.stages.at(-1), 'active');
  root.dispose();
});

test('다운로드 도중 탭한 알림도 다시 정리하고 스토어 연결 뒤 강제 reload하지 않는다', async () => {
  let finish: (value: { isNew: boolean }) => void = () => {};
  const pending = new Promise<{ isNew: boolean }>((resolve) => { finish = resolve; });
  let calls = 0;
  const root = rootFixture(async () => ++calls === 1 ? 'none' : 'opened', true, () => pending);
  await flush();
  assert.deepEqual(root.counts(), { checks: 1, downloads: 1, reloads: 0 });
  finish({ isNew: true });
  await flush();
  assert.equal(calls, 2);
  assert.equal(root.counts().reloads, 0);
  assert.equal(root.stages.at(-1), 'active');
  root.dispose();
});

test('일반 실행은 기존 OTA 재시작을 유지하고 연결 실패는 스토어 버튼으로 안내한다', async () => {
  const ordinary = rootFixture(async () => 'none', true);
  await flush();
  assert.deepEqual(ordinary.counts(), { checks: 1, downloads: 1, reloads: 1 });
  ordinary.dispose();
  const failed = rootFixture(async () => 'failed', true);
  await flush();
  assert.equal(failed.stages.at(-1), 'update');
  assert.equal(failed.counts().reloads, 0);
  failed.dispose();
});

test('알림 조회 시간 초과는 시작을 막지 않고, 확인되지 않은 응답을 OTA 재시작으로 지우지 않는다', async () => {
  const root = rootFixture(async () => 'unavailable', true);
  await flush();
  assert.equal(root.stages.at(-1), 'active');
  assert.deepEqual(root.counts(), { checks: 0, downloads: 0, reloads: 0 });
  root.dispose();
});
