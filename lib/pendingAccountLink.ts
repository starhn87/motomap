import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SocialLoginProvider } from '@/lib/socialAuth';

const STORAGE_KEY = 'pending-account-link-provider-v1';
const PROVIDERS = new Set<SocialLoginProvider>(['apple', 'kakao', 'naver', 'google']);

export const SOCIAL_PROVIDER_LABELS: Record<SocialLoginProvider, string> = {
  apple: 'Apple',
  kakao: '카카오',
  naver: '네이버',
  google: 'Google',
};

export function socialProviderFromIdentity(identity: unknown): SocialLoginProvider | null {
  const normalized = identity === 'custom:naver' ? 'naver' : identity;
  return PROVIDERS.has(normalized as SocialLoginProvider)
    ? normalized as SocialLoginProvider
    : null;
}

export async function getPendingAccountLink(): Promise<SocialLoginProvider | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return socialProviderFromIdentity(value);
}

export async function setPendingAccountLink(provider: SocialLoginProvider): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, provider);
}

export async function clearPendingAccountLink(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
