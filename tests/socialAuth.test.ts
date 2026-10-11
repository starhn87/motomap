import assert from 'node:assert/strict';
import test from 'node:test';
import * as authErrors from '../lib/socialAuthError';
import { loadModule } from './helpers/loadModule';

type Provider = 'apple' | 'kakao' | 'naver' | 'google';
type AuthModule = {
  signInWithSocialProvider: (provider: Provider) => Promise<boolean>;
  linkSocialProvider: (provider: Provider) => Promise<boolean>;
};

function fixture(options: { error?: unknown; browserResult?: Record<string, string>; appleAvailable?: boolean } = {}) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const recent: string[] = [];
  const record = (method: string) => async (args: Record<string, unknown>) => {
    calls.push({ method, args });
    return { data: { url: 'https://provider.test/authorize' }, error: null };
  };
  const authenticate = async () => {
    if (options.error) throw options.error;
    return { identityToken: 'apple-id-token', idToken: 'kakao-id-token', accessToken: 'kakao-access' };
  };
  const auth = loadModule<AuthModule>('lib/socialAuth.ts', {
    'expo-apple-authentication': {
      isAvailableAsync: async () => options.appleAvailable ?? true,
      signInAsync: authenticate, AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    },
    'expo-crypto': {
      randomUUID: () => 'raw-nonce', digestStringAsync: async () => 'hashed-nonce',
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    },
    'expo-linking': { createURL: () => 'ridemap://auth/callback' },
    'expo-web-browser': {
      maybeCompleteAuthSession() {},
      openAuthSessionAsync: async () => {
        if (options.error) throw options.error;
        return options.browserResult ?? { type: 'success', url: 'ridemap://auth/callback?code=test-code' };
      },
    },
    '@react-native-kakao/user': { login: authenticate },
    '@/lib/recentLogin': { setRecentLoginProvider: async (provider: string) => { recent.push(provider); } },
    '@/lib/socialAuthError': authErrors,
    '@/lib/supabase': { supabase: { auth: {
      signInWithOAuth: record('oauth'), signInWithIdToken: record('idToken'), linkIdentity: record('link'),
      exchangeCodeForSession: async (code: string) => record('exchange')({ code }),
      setSession: record('setSession'),
    } } },
  });
  return { auth, calls, recent };
}

for (const provider of ['apple', 'kakao', 'naver', 'google'] as const) {
  test(`${provider}의 로그인·수동 연결 경로와 최근 로그인 기록을 분리한다`, async () => {
    for (const mode of ['signInWithSocialProvider', 'linkSocialProvider'] as const) {
      const { auth, calls, recent } = fixture();
      assert.equal(await auth[mode](provider), true);
      const first = calls[0];
      assert.equal(first.method, mode === 'linkSocialProvider' ? 'link' : ['apple', 'kakao'].includes(provider) ? 'idToken' : 'oauth');
      assert.equal(first.args.provider, provider === 'naver' ? 'custom:naver' : provider);
      if (provider === 'apple' || provider === 'kakao') assert.equal(first.args.nonce, 'raw-nonce');
      else assert.equal(calls[1].method, 'exchange');
      assert.deepEqual(recent, mode === 'signInWithSocialProvider' ? [provider] : []);
    }
  });
}

test('Apple·카카오 SDK 취소와 브라우저 취소는 실패/최근 로그인으로 기록하지 않는다', async () => {
  for (const [provider, code] of [['apple', 'ERR_REQUEST_CANCELED'], ['kakao', 'Cancelled']] as const) {
    const { auth, calls, recent } = fixture({ error: { code, message: 'vendor detail' } });
    assert.equal(await auth.signInWithSocialProvider(provider), false);
    assert.equal(calls.length, 0);
    assert.equal(recent.length, 0);
  }
  assert.equal(authErrors.isSocialAuthCancelled({ code: 'AccessDenied' }), true);
  for (const type of ['cancel', 'dismiss']) {
    const { auth, calls, recent } = fixture({ browserResult: { type } });
    assert.equal(await auth.signInWithSocialProvider('google'), false);
    assert.equal(calls.length, 1);
    assert.equal(recent.length, 0);
  }
});

test('OAuth 동의 거부·비정상 콜백·미지원 Apple은 세션 성공으로 오인하지 않는다', async () => {
  const denied = fixture({ browserResult: {
    type: 'success', url: 'ridemap://auth/callback?error=access_denied&error_description=vendor-secret',
  } });
  assert.equal(await denied.auth.signInWithSocialProvider('naver'), false);
  const empty = fixture({ browserResult: { type: 'success', url: 'ridemap://auth/callback' } });
  await assert.rejects(empty.auth.signInWithSocialProvider('google'));
  assert.equal(empty.recent.length, 0);
  const unavailable = fixture({ appleAvailable: false });
  await assert.rejects(unavailable.auth.signInWithSocialProvider('apple'));
  assert.equal(unavailable.calls.length, 0);
});

test('알 수 없는 실패는 취소로 숨기지 않고 안내에는 원문을 노출하지 않는다', async () => {
  const error = { code: 'unknown-vendor-code', message: 'token=private&lat=37.5' };
  const { auth, recent } = fixture({ error });
  await assert.rejects(auth.signInWithSocialProvider('kakao'), (actual) => actual === error);
  assert.equal(recent.length, 0);
  assert.equal(authErrors.friendlySocialAuthError(error).includes('private'), false);
  assert.match(authErrors.friendlySocialAuthError({ code: 'identity_already_exists' }), /기존 로그인/);
});
