import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const nativeKey = '0123456789abcdef0123456789abcdef';
function fixture(key: unknown) {
  return loadModule<typeof import('../app/+native-intent')>('app/+native-intent.tsx', {
    'expo-constants': { expoConfig: { extra: { kakaoNativeAppKey: key } } },
  }).redirectSystemPath;
}

test('카카오 성공·취소 복귀는 콜드/웜 모두 라우터 이동 없이 SDK에 맡긴다', () => {
  const redirect = fixture(nativeKey);
  for (const initial of [true, false]) {
    for (const suffix of ['?code=test-code&state=test-state', '?error=access_denied', '/?code=test-code', '']) {
      assert.equal(redirect({ path: `kakao${nativeKey}://oauth${suffix}`, initial }), null);
    }
  }
});

test('공유·일반 경로·다른 제공자와 잘못된 URL은 원문 그대로 기존 라우터에 전달한다', () => {
  const redirect = fixture(nativeKey);
  const paths = [
    'https://motomap.kr/place/test-place', 'https://motomap.kr/riding/test-ride',
    'ridemap://place/test-place', 'ridemap://auth/callback?code=test-code',
    '/settings', '/does-not-exist', 'not a url', '',
    `kakao${nativeKey}://other`, `kakao${nativeKey}://oauth/another-page`,
    `kakao${nativeKey}://user@oauth`, `kakao${nativeKey}://oauth:123`,
    'kakaoffffffffffffffffffffffffffffffff://oauth?code=test-code',
  ];
  for (const path of paths) {
    for (const initial of [true, false]) assert.equal(redirect({ path, initial }), path);
  }
});

test('키가 없거나 잘못된 설정에서는 다른 스킴을 추측해서 차단하지 않는다', () => {
  const path = `kakao${nativeKey}://oauth?code=test-code`;
  for (const key of [null, undefined, '', 'bad-key', 123]) {
    assert.equal(fixture(key)({ path, initial: false }), path);
  }
});

test('설치된 Router의 실제 warm 구독은 카카오 콜백에서 화면 이동하지 않고 공유는 전달한다', async () => {
  let receive: (event: { url: string }) => Promise<void> = async () => {};
  let removed = 0;
  const navigations: string[] = [];
  const linking = loadModule<{ subscribe: (intent: unknown, redirects: unknown[]) =>
    (listener: (url: string) => void) => () => void }>('node_modules/expo-router/build/link/linking.js', {
    'expo-linking': { addEventListener: (_event: string, listener: typeof receive) => {
      receive = listener;
      return { remove: () => { removed++; } };
    } },
    'react-native': { Platform: { OS: 'ios' } },
    '../fork/extractPathFromURL': {}, '../fork/getPathFromState': {}, '../fork/getStateFromPath': {},
    '../fork/useLinking': {}, '../getRoutesRedirects': { applyRedirects: (url: string) => url },
  });
  const cleanup = linking.subscribe({ redirectSystemPath: fixture(nativeKey) }, [])((url) => navigations.push(url));
  await receive({ url: `kakao${nativeKey}://oauth?code=test-code` });
  await receive({ url: `kakao${nativeKey}://oauth?error=access_denied` });
  assert.deepEqual(navigations, []);
  const share = 'https://motomap.kr/place/test-place';
  await receive({ url: share });
  assert.deepEqual(navigations, [share]);
  cleanup();
  assert.equal(removed, 1);
});

test('설치된 Router의 실제 cold 초기 URL은 SDK 콜백만 null로 시작한다', async () => {
  for (const path of [`kakao${nativeKey}://oauth?code=test-code`, 'https://motomap.kr/riding/test-ride']) {
    for (const asyncUrl of [false, true]) {
      const configModule = loadModule<{ getLinkingConfig: (routes: unknown, context: unknown,
        getRouteInfo: unknown, options: unknown) => { getInitialURL: () => string | null | Promise<string | null> } }>(
        'node_modules/expo-router/build/getLinkingConfig.js', {
          'expo-modules-core': { Platform: { OS: 'ios' } },
          './constants': { INTERNAL_SLOT_NAME: '__root', SITEMAP_ROUTE_NAME: '_sitemap', NOT_FOUND_ROUTE_NAME: '+not-found' },
          './getReactNavigationConfig': { getReactNavigationConfig: () => ({}) },
          './getRoutesRedirects': { applyRedirects: (url: string) => url },
          './link/linking': { getInitialURL: () => asyncUrl ? Promise.resolve(path) : path, subscribe: () => {} },
          './react-navigation/native': {},
        });
      const context = Object.assign(() => ({ redirectSystemPath: fixture(nativeKey) }), {
        keys: () => ['./+native-intent.tsx'],
      });
      const config = configModule.getLinkingConfig({}, context, () => ({ segments: [] }), { skipGenerated: true });
      assert.equal(await config.getInitialURL(), path.startsWith('kakao') ? null : path);
    }
  }
});
