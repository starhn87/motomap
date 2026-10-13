import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

test('루트 연결은 서버·지도 의존성 없이 고정된 App Store URL만 사용한다', async () => {
  let deps: Parameters<typeof import('../lib/serviceResumeNotification').setupServiceResumeNotification>[0] | undefined;
  const urls: string[] = [];
  const { setupResumeStoreLink } = loadModule<typeof import('../lib/setupServiceResumeNotification')>(
    'lib/setupServiceResumeNotification.ts', {
      '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
      'expo-notifications': {
        DEFAULT_ACTION_IDENTIFIER: 'default',
        getLastNotificationResponseAsync: async () => null,
        addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
      },
      'react-native': { AppState: { currentState: 'active' }, Linking: { openURL: async (url: string) => { urls.push(url); } } },
      '@/constants/app': { APP_STORE_URL: 'https://apps.apple.com/kr/app/id6773636183' },
      './serviceResumeNotification': {
        RESUME_NOTIFICATION_KEY: 'handled',
        RESUME_PENDING_KEY: 'pending',
        setupServiceResumeNotification: (value: typeof deps) => { deps = value; return { dispose() {}, settleStartup: async () => 'none' }; },
      },
      './foregroundLink': { createForegroundWaiter: () => ({ waitForActive: async () => true, dispose() {} }) },
    },
  );
  setupResumeStoreLink();
  assert.ok(deps);
  await deps.openStore();
  assert.deepEqual(urls, ['https://apps.apple.com/kr/app/id6773636183']);
});
