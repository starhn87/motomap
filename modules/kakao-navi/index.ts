import { requireNativeModule } from 'expo-modules-core';

// 카카오내비 SDK(KNSDK) 네이티브 브리지. iOS 전용.
interface BikeRoute {
  /** 미터 */
  distance: number;
  /** 초 */
  duration: number;
}

interface KakaoNaviModule {
  /** 앱 키로 SDK 인증. 실패 시 reject */
  initialize(appKey: string): Promise<boolean>;
  /** 이륜차 경로 계산. 실패 시 reject */
  requestBikeRoute(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
  ): Promise<BikeRoute>;
}

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
