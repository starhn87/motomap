import Constants from 'expo-constants';

import KakaoNavi from '@/modules/kakao-navi';

// KNSDK lazy 초기화 — 앱 시작에서 하지 않는다. 초기화가 백그라운드 위치 구독을
// 켜서 길안내를 안 해도 앱이 백그라운드에서 계속 GPS 를 받는다(실측: locationd
// 로그 대조 실험, 밤새 배터리 소모 사례). 내비 진입(경로 미리보기) 시 최초
// 1회만 수행하고, 실패하면 다음 진입에서 다시 시도한다.
let pending: Promise<void> | null = null;

export function ensureKakaoNaviReady(): Promise<void> {
  if (!pending) {
    const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey as string | undefined;
    if (!appKey) return Promise.reject(new Error('카카오 앱 키가 없습니다.'));
    pending = KakaoNavi.initialize(appKey).then(
      () => undefined,
      (err) => {
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}
