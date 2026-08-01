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

/** 안내 화면 커스텀 메뉴 버튼 id — 네이티브(KNNaviPresenter.m) 등록 값과 짝 */
export const MOTOMAP_MENU_ID = 100;

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

/**
 * 경로 에러에서 KNSDK 코드를 꺼낸다.
 *
 * 네이티브가 reject 코드를 `E_KNSDK_ROUTE_20413` 처럼 붙여 보내고
 * (안내 실패 이벤트는 `code` 필드), 그걸 그대로 읽는다. 사람이 읽는 문구를
 * 파싱하지 않으므로 SDK 메시지가 바뀌어도 분기가 깨지지 않는다.
 */
export function routeErrorCode(err: unknown): number | null {
  const e = err as { code?: unknown; message?: string } | null;
  const raw = typeof e?.code === 'string' ? e.code : null;
  const m = raw?.match(/_(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * 경로 에러를 사용자 문구로. 미리보기·안내 시작의 토스트가 함께 쓴다.
 * 안내 실패 이벤트처럼 코드와 문구가 따로 오는 경우엔 code 를 직접 넘긴다.
 */
export function friendlyRouteError(err: unknown, knCode?: string | null): string {
  const code = knCode ? Number(knCode) : routeErrorCode(err);
  if (code === 20413) {
    return '자동차 전용도로를 빼면 이어지는 도로가 없어요. 바다 건너나 도로가 끊긴 곳은 안내할 수 없어요.';
  }
  if (code === 20412) {
    return '경유지가 도로와 이어지지 않아요.';
  }
  return String((err as { message?: string })?.message ?? err);
}

interface KakaoNaviModule {
  /** 앱 키로 SDK 인증. 실패 시 reject */
  initialize(appKey: string): Promise<boolean>;
  /**
   * 길안내를 네이티브 전체화면으로 띄운다. 결과는 이벤트로 온다.
   * vias 는 [lng, lat, lng, lat, ...] 평면 배열 — 없으면 빈 배열.
   *
   * keepStart: 사용자가 출발지를 직접 정했을 때 true. 자동 재탐색을 끈 채
   * 시작해 정한 출발지에서 이어지는 경로를 지킨다(켜 두면 SDK 가 현재 위치를
   * 경로 이탈로 보고 즉시 재탐색해 버린다). 실제로 경로에 올라타면 네이티브가
   * 재탐색을 다시 켠다.
   */
  startGuide(
    startLng: number,
    startLat: number,
    goalLng: number,
    goalLat: number,
    goalName: string,
    vias: number[],
    priority: RoutePriority,
    keepStart: boolean,
  ): Promise<void>;
  addListener(
    event: 'onGuideStarted',
    listener: () => void,
  ): { remove: () => void };
  addListener(
    event: 'onGuideEnd',
    listener: () => void,
  ): { remove: () => void };
  addListener(
    event: 'onGuideFailed',
    // code 는 KNSDK 에러 코드(문자열) — SDK 밖에서 난 실패면 없다
    listener: (payload: { code?: string | null; message: string }) => void,
  ): { remove: () => void };
  addListener(
    event: 'onGuideMenu',
    listener: (payload: { id: number }) => void,
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

export default requireNativeModule<KakaoNaviModule>('KakaoNavi');
