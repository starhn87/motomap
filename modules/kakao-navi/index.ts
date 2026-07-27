import { requireNativeModule } from 'expo-modules-core';

// 카카오내비 SDK(KNSDK) 네이티브 브리지. iOS 전용.
interface KakaoNaviModule {
  /** 앱 키로 SDK 인증. 실패 시 reject */
  initialize(appKey: string): Promise<boolean>;
}

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
