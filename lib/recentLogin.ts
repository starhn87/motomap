import AsyncStorage from '@react-native-async-storage/async-storage';

export type LoginProvider = 'apple' | 'kakao' | 'naver' | 'google' | 'email';

const STORAGE_KEY = 'recent-login-provider-v1';
const PROVIDERS = new Set<LoginProvider>(['apple', 'kakao', 'naver', 'google', 'email']);

export async function getRecentLoginProvider(): Promise<LoginProvider | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return PROVIDERS.has(value as LoginProvider) ? (value as LoginProvider) : null;
}

export async function setRecentLoginProvider(provider: LoginProvider): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, provider);
}

export async function clearRecentLoginProvider(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
