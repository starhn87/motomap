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
  /**
   * 길안내를 네이티브 전체화면으로 띄운다. 결과는 이벤트로 온다.
   * vias 는 [lng, lat, lng, lat, ...] 평면 배열 — 없으면 빈 배열.
   */
  startGuide(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    goalName: string,
    vias: number[],
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
  addListener(
    event: 'onGuideMenu',
    listener: (payload: { id: number }) => void,
  ): { remove: () => void };
  /** 안내 화면 위 액션시트. 고른 인덱스, 취소면 -1 */
  showGuideOptions(title: string, labels: string[]): Promise<number>;
  /** 안내를 종료한다 — 정상 종료 흐름(onGuideEnd)을 탄다 */
  stopGuide(): Promise<void>;
  /** 안내 화면 위에 잠깐 떴다 사라지는 알림 */
  showGuideNotice(message: string): Promise<void>;
  /** 안내 중 목적지 변경 — 현 위치에서 새 목적지로 재탐색 */
  changeGuideDestination(
    lng: number,
    lat: number,
    name: string,
    priority: RoutePriority,
  ): Promise<boolean>;
  /** 이륜차 경로 계산 (미리보기용, 안내와 같은 엔진). vias 형식은 동일. */
  requestBikeRoute(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    vias: number[],
    priority: RoutePriority,
  ): Promise<BikeRoute>;
}

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
