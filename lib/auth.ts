import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import type { Provider } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = makeRedirectUri({ scheme: 'ridemap' });

async function signInWithProvider(provider: Provider, scopes?: string) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      ...(scopes ? { scopes } : {}),
    },
  });

  if (error) throw error;
  if (data.url) {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const params = new URLSearchParams(url.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    }
  }
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, nickname: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: nickname },
    },
  });
  if (error) throw error;
}

export const signInWithKakao = () => signInWithProvider('kakao', 'profile_nickname profile_image');
export const signInWithGoogle = () => signInWithProvider('google');
export const signInWithNaver = () => signInWithProvider('naver' as Provider);
