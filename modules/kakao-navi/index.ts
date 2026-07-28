import { requireNativeModule } from 'expo-modules-core';

// 카카오내비 SDK(KNSDK) 네이티브 브리지. iOS 전용.
export interface BikeRoute {
  /** 미터 */
  distance: number;
  /** 초 */
  duration: number;
  /** [lng, lat, lng, lat, ...] 평면 배열 (WGS84) */
  polyline: number[];
}

/** KNRoutePriority 원시값. 고속도로 우선(3)은 이륜차 진입 금지라 뺐다. */
export const ROUTE_PRIORITIES = [
  { value: 0, label: '추천' },
  { value: 1, label: '시간 우선' },
  { value: 2, label: '거리 우선' },
  { value: 4, label: '큰길 우선' },
] as const;

export type RoutePriority = (typeof ROUTE_PRIORITIES)[number]['value'];

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
    priority: RoutePriority,
  ): Promise<void>;
  addListener(
    event: 'onGuideEnd',
    listener: () => void,
  ): { remove: () => void };
  addListener(
    event: 'onGuideFailed',
    listener: (payload: { message: string }) => void,
  ): { remove: () => void };
  /** 이륜차 경로 계산 (미리보기용, 안내와 같은 엔진). 실패 시 reject */
  requestBikeRoute(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    priority: RoutePriority,
  ): Promise<BikeRoute>;
}

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
