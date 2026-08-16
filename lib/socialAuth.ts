import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { login as loginWithKakaoSdk } from '@react-native-kakao/user';
import type { Provider } from '@supabase/supabase-js';

import { setRecentLoginProvider, type LoginProvider } from '@/lib/recentLogin';
import { supabase } from '@/lib/supabase';

export type SocialLoginProvider = Exclude<LoginProvider, 'email'>;
type AuthMode = 'sign_in' | 'link';

WebBrowser.maybeCompleteAuthSession();

async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

function callbackParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  for (const [key, value] of hashParams.entries()) params.set(key, value);
  return params;
}

async function completeBrowserAuth(url: string): Promise<void> {
  const params = callbackParams(url);
  const error = params.get('error_description') ?? params.get('error');
  if (error) throw new Error(error);

  const code = params.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
  }
}

async function browserAuth(provider: Provider, mode: AuthMode): Promise<boolean> {
  const redirectTo = Linking.createURL('auth/callback');
  const credentials = {
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  } as const;
  const { data, error } = mode === 'link'
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithOAuth(credentials);
  if (error) throw error;
  if (!data.url) throw new Error('로그인 페이지를 열지 못했습니다.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await completeBrowserAuth(result.url);
  return true;
}

async function appleAuth(mode: AuthMode): Promise<boolean> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('이 기기에서는 Apple 로그인을 사용할 수 없습니다.');
  }

  const nonce = await createNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: nonce.hashed,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }

  if (!credential.identityToken) throw new Error('Apple 인증 정보를 받지 못했습니다.');
  const credentials = {
    provider: 'apple' as const,
    token: credential.identityToken,
    nonce: nonce.raw,
  };
  const { error } = mode === 'link'
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithIdToken(credentials);
  if (error) throw error;

  return true;
}

async function kakaoAuth(mode: AuthMode): Promise<boolean> {
  const nonce = await createNonce();
  const token = await loginWithKakaoSdk({ nonce: nonce.hashed });
  if (!token.idToken) {
    throw new Error('카카오 OpenID Connect 설정을 확인해주세요.');
  }

  const credentials = {
    provider: 'kakao' as const,
    token: token.idToken,
    access_token: token.accessToken,
    nonce: nonce.raw,
  };
  const { error } = mode === 'link'
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithIdToken(credentials);
  if (error) throw error;
  return true;
}

async function runSocialAuth(provider: SocialLoginProvider, mode: AuthMode): Promise<boolean> {
  if (provider === 'apple') return appleAuth(mode);
  if (provider === 'kakao') return kakaoAuth(mode);
  if (provider === 'naver') return browserAuth('custom:naver', mode);
  return browserAuth('google', mode);
}

export async function signInWithSocialProvider(
  provider: SocialLoginProvider,
): Promise<boolean> {
  const completed = await runSocialAuth(provider, 'sign_in');
  if (completed) await setRecentLoginProvider(provider).catch(() => {});
  return completed;
}

export async function linkSocialProvider(provider: SocialLoginProvider): Promise<boolean> {
  return runSocialAuth(provider, 'link');
}
