import { requireOptionalNativeModule } from 'expo-modules-core';

export { friendlyRouteError, routeErrorCode } from '@/lib/kakaoRouteErrors';

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

/** 안내 화면 커스텀 메뉴 버튼 id — 네이티브(KNNaviPresenter.m) 등록 값과 짝 */
export const MOTOMAP_MENU_ID = 100;

/** 안내 화면의 전용 위험 제보 버튼 id (KNNaviPresenter.m 의 hazardTapped 와 짝) */
export const HAZARD_BUTTON_ID = 101;

/** [lng, lat, ...] 평면 배열(브리지 wire 포맷) → [lng, lat] 쌍 배열 */
export function pairsFromFlat(flat: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return pairs;
}

/** [lng, lat, ...] 평면 배열 → 지도 오버레이용 {latitude, longitude} 배열 */
export function latLngsFromFlat(flat: number[]): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    coords.push({ longitude: flat[i], latitude: flat[i + 1] });
  }
  return coords;
}

export const KAKAO_NAVI_FEATURES = [
  'bike_route_preview',
  'guide_options',
  'guide_hazard_report',
  'guide_poi_tap',
  'custom_car_image_guard',
  'app_lifecycle_forwarding',
  'accessibility_nil_guard',
] as const;

export type KakaoNaviFeature = (typeof KAKAO_NAVI_FEATURES)[number];

/**
 * capability 상수를 도입하기 전 바이너리가 이미 제공하던 계약.
 * bridgeVersion 0을 기능 없음으로 취급하면 이전 runtime 백포트에서 정상 기능까지
 * 숨겨지므로, 검증된 기존 기능만 보수적으로 명시한다.
 */
const LEGACY_KAKAO_NAVI_FEATURES = [
  'bike_route_preview',
  'guide_options',
  'guide_hazard_report',
  'guide_poi_tap',
] as const satisfies readonly KakaoNaviFeature[];

type GuideEventPayload = {
  onGuideStarted: undefined;
  onGuideEnd: undefined;
  onGuideFailed: { code?: string | null; message: string };
  onGuideMenu: { id: number };
  onGuidePoiTap: { name: string; latitude: number; longitude: number };
};

interface KakaoNaviModule {
  /** 네이티브 wire 계약. 구버전 바이너리에는 없을 수 있어 optional이다. */
  bridgeVersion?: number;
  features?: string[];
  /** 앱 키로 SDK 인증. 실패 시 reject */
  initialize(appKey: string): Promise<boolean>;
  /**
   * 길안내를 네이티브 전체화면으로 띄운다. 결과는 이벤트로 온다.
   * vias 는 [lng, lat, lng, lat, ...] 평면 배열 — 없으면 빈 배열.
   *
   * preview: 정한 출발지에서 경로를 훑어보는 미리보기면 true — 시뮬레이션
   * 안내로 뜬다. 실주행 안내는 차량 위치를 항상 실제 GPS 에 매칭하므로
   * 현재 위치와 먼 출발지에서는 시작할 수 없다.
   */
  startGuide(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    goalName: string,
    vias: number[],
    priority: RoutePriority,
    preview: boolean,
  ): Promise<void>;
  addListener<E extends keyof GuideEventPayload>(
    event: E,
    listener: (payload: GuideEventPayload[E]) => void,
  ): { remove: () => void };
  /** 안내 화면 위 액션시트. 고른 인덱스, 취소면 -1 */
  showGuideOptions(title: string, labels: string[]): Promise<number>;
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

const nativeModule = requireOptionalNativeModule<KakaoNaviModule>('KakaoNavi');
const unavailable = () => Promise.reject(new Error('이 기기에서는 앱 내 길안내를 지원하지 않습니다.'));
const unavailableModule = {
  bridgeVersion: 0,
  features: [],
  initialize: unavailable,
  startGuide: unavailable,
  addListener: () => ({ remove: () => {} }),
  showGuideOptions: unavailable,
  showGuideNotice: unavailable,
  changeGuideDestination: unavailable,
  requestBikeRoute: unavailable,
} as KakaoNaviModule;

const KakaoNavi = nativeModule ?? unavailableModule;

export function isKakaoNaviAvailable(): boolean {
  return nativeModule !== null;
}

export function getKakaoNaviCapabilities(): {
  bridgeVersion: number;
  features: KakaoNaviFeature[];
} {
  const bridgeVersion =
    typeof KakaoNavi.bridgeVersion === 'number' ? KakaoNavi.bridgeVersion : 0;
  const reportedFeatures = KakaoNavi.features;
  const features = new Set(
    nativeModule && bridgeVersion === 0 && reportedFeatures === undefined
      ? LEGACY_KAKAO_NAVI_FEATURES
      : (reportedFeatures ?? []),
  );
  return {
    bridgeVersion,
    features: KAKAO_NAVI_FEATURES.filter((feature) => features.has(feature)),
  };
}

export function supportsKakaoNaviFeature(feature: KakaoNaviFeature): boolean {
  return getKakaoNaviCapabilities().features.includes(feature);
}

export default KakaoNavi;
