import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
import { allowedLocationPrivacy } from './helpers/allowedLocationPrivacy';

import type * as Provider from '../lib/providerErrors';
import type * as Errors from '../lib/kakaoRouteErrors';

function setup(initialize: (key: string) => Promise<boolean>, key: string | undefined = 'test-key', available = true) {
  const provider = loadModule<typeof Provider>('lib/providerErrors.ts', {});
  const errors = loadModule<typeof Errors>('lib/kakaoRouteErrors.ts', { '@/lib/providerErrors': provider });
  const init = loadModule<{ ensureKakaoNaviReady: () => Promise<void> }>('lib/kakaoNaviInit.ts', {
    'expo-constants': { expoConfig: { extra: { kakaoNativeAppKey: key } } },
    '@/modules/kakao-navi': { __esModule: true, default: { initialize, setLocationUseAllowed: async () => {} },
      isKakaoNaviAvailable: () => available, supportsKakaoNaviFeature: () => true },
    '@/stores/useLocationPrivacyStore': allowedLocationPrivacy,
    '@/lib/kakaoRouteErrors': errors,
    '@/lib/providerErrors': provider,
  });
  return { ...init, provider };
}

test('동시 초기화와 성공 후 재진입은 네이티브 초기화 1회만 공유한다', async () => {
  let calls = 0;
  const sdk = setup(async () => { calls += 1; return true; });
  await Promise.all([sdk.ensureKakaoNaviReady(), sdk.ensureKakaoNaviReady()]);
  await sdk.ensureKakaoNaviReady();
  assert.equal(calls, 1);
});

test('C101 설정 실패는 재진입에도 네이티브를 반복 호출하지 않는다', async () => {
  let calls = 0;
  const sdk = setup(async () => { calls += 1; throw { code: 'E_KNSDK_INIT_C101', message: 'secret' }; });
  for (let i = 0; i < 3; i++) {
    await assert.rejects(sdk.ensureKakaoNaviReady(), (error: unknown) =>
      error instanceof sdk.provider.ProviderError && error.kind === 'configuration' && !error.message.includes('secret'));
  }
  assert.equal(calls, 1);
});

test('C103 연결 실패는 다음 명시적 시도에서 회복 가능하다', async () => {
  let calls = 0;
  const sdk = setup(async () => {
    if (++calls === 1) throw { code: 'E_KNSDK_INIT_C103' };
    return true;
  });
  await assert.rejects(sdk.ensureKakaoNaviReady());
  await sdk.ensureKakaoNaviReady();
  assert.equal(calls, 2);
});

test('키 누락·미지원 SDK는 초기화를 호출하지 않는다', async () => {
  let calls = 0;
  const sdk = setup(async () => { calls += 1; return true; }, '');
  const unsupported = setup(async () => { calls += 1; return true; }, 'test-key', false);
  await assert.rejects(sdk.ensureKakaoNaviReady());
  await assert.rejects(sdk.ensureKakaoNaviReady());
  await assert.rejects(unsupported.ensureKakaoNaviReady());
  assert.equal(calls, 0);
});

test('false 응답과 동기 예외는 초기화 성공 캐시에 남지 않는다', async () => {
  let calls = 0;
  const sdk = setup(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve(false);
    if (calls === 2) throw new Error('vendor-secret');
    return Promise.resolve(true);
  });
  await assert.rejects(sdk.ensureKakaoNaviReady());
  await assert.rejects(sdk.ensureKakaoNaviReady(), (error: unknown) =>
    error instanceof sdk.provider.ProviderError && !error.message.includes('vendor-secret'));
  await sdk.ensureKakaoNaviReady();
  assert.equal(calls, 3);
});

test('초기화 대기는 공유하되 재진입마다 위치 동의를 다시 검사한다', async () => {
  let resolve!: (value: boolean) => void;
  let calls = 0;
  const sdk = setup(() => { calls += 1; return new Promise<boolean>((done) => { resolve = done; }); });
  const first = sdk.ensureKakaoNaviReady();
  const second = sdk.ensureKakaoNaviReady();
  await new Promise((done) => setImmediate(done));
  assert.equal(calls, 1);
  resolve(true);
  await Promise.all([first,second]);
});
