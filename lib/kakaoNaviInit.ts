import Constants from 'expo-constants';

import KakaoNavi, { isKakaoNaviAvailable } from '@/modules/kakao-navi';
import { kakaoNaviProviderError } from '@/lib/kakaoRouteErrors';
import { ProviderError, rememberProviderFailure, requireProviderAvailable } from '@/lib/providerErrors';

// KNSDK lazy 초기화 — 앱 시작에서 하지 않는다. 초기화가 백그라운드 위치 구독을
// 켜서 길안내를 안 해도 앱이 백그라운드에서 계속 GPS 를 받는다(실측: locationd
// 로그 대조 실험, 밤새 배터리 소모 사례). 내비 진입(경로 미리보기) 시 최초
// 1회만 수행한다. 설정 실패는 세션 내 차단하고, 그 외 실패만 다음 진입에서 다시 시도한다.
let pending: Promise<void> | null = null;

export function ensureKakaoNaviReady(): Promise<void> {
  try {
    requireProviderAvailable('kakao-navi');
  } catch (error) {
    return Promise.reject(error);
  }
  if (!pending) {
    if (!isKakaoNaviAvailable()) {
      return Promise.reject(new ProviderError('kakao-navi', 'initialize', 'configuration', undefined, 'UNSUPPORTED'));
    }
    const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey as string | undefined;
    if (!appKey) {
      const failure = new ProviderError('kakao-navi', 'initialize', 'configuration', undefined, 'C101');
      rememberProviderFailure(failure);
      return Promise.reject(failure);
    }
    pending = Promise.resolve().then(() => KakaoNavi.initialize(appKey))
      .then((initialized) => {
        if (initialized !== true) throw new ProviderError('kakao-navi', 'initialize', 'invalid_response');
      })
      .catch((err) => {
        pending = null;
        const failure = kakaoNaviProviderError(err, 'initialize');
        rememberProviderFailure(failure);
        throw failure;
      });
  }
  return pending;
}
