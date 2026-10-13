import Constants from 'expo-constants';

/** 카카오 SDK 복귀 URL은 인증 SDK에 맡기고 화면 이동으로 처리하지 않는다. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  const nativeKey = Constants.expoConfig?.extra?.kakaoNativeAppKey;
  if (typeof nativeKey !== 'string' || !/^[a-f0-9]{32}$/i.test(nativeKey)) return path;

  try {
    const url = new URL(path);
    if (url.protocol === `kakao${nativeKey.toLowerCase()}:` && url.hostname === 'oauth' &&
        (url.pathname === '' || url.pathname === '/') && !url.username && !url.password && !url.port) {
      return null;
    }
  } catch { /* SDK 콜백이 아닌 경로는 기존 라우터가 처리한다. */ }
  return path;
}
