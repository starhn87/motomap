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
  /** 길안내를 네이티브 전체화면으로 띄운다. 결과는 이벤트로 온다. */
  startGuide(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    goalName: string,
  ): Promise<void>;
  addListener(
    event: 'onGuideEnd',
    listener: () => void,
  ): { remove: () => void };
  addListener(
    event: 'onGuideFailed',
    listener: (payload: { message: string }) => void,
  ): { remove: () => void };
  /** 이륜차 경로 계산. 실패 시 reject */
  requestBikeRoute(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
  ): Promise<BikeRoute>;
}

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
