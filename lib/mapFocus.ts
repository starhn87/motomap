import { router } from 'expo-router';

import { track, type PlaceSource } from '@/lib/analytics';
import { isMainMapFocused } from '@/lib/mapCamera';
import { queryClient } from '@/lib/queryClient';
import type { Place } from '@/types';

type FocusOverride = (
  placeId: string,
  opts?: { reviewId?: string; fromCourseId?: string },
) => void;

// 지도 화면이 오버레이(place-preview)로 떠 있는 동안 등록된다 — 그 안에서의
// "지도에서 보기"는 탭 전환이 아니라 오버레이 자신을 갱신해야 스택이 산다.
let focusOverride: FocusOverride | null = null;

export function setMapFocusOverride(override: FocusOverride | null) {
  focusOverride = override;
}

// 지도 오버레이(place-preview)가 스택에 살아 있는 동안 0 보다 크다.
// 오버레이를 거쳐 열린 미리보기의 X 는 스택을 되감지 않고 지도 탭으로 바로
// 나가야 해서(오버레이→미리보기→오버레이… 순회 방지) 이 값으로 가른다.
let overlayDepth = 0;

export function pushMapOverlayDepth() {
  overlayDepth += 1;
}

export function popMapOverlayDepth() {
  overlayDepth = Math.max(0, overlayDepth - 1);
}

export function hasMapOverlayInStack(): boolean {
  return overlayDepth > 0;
}

type MapRouteParams = Record<string, string | undefined>;

function openMapRoute(params: MapRouteParams) {
  if (isMainMapFocused()) {
    // POP_TO는 이미 현재 route인 탭 내부에서는 처리되지 않는다. 같은 지도 안의
    // 근처 장소 선택은 현재 route params만 바꿔 기존 딥링크 소비 경로를 탄다.
    router.setParams(params);
    return;
  }
  router.dismissTo({ pathname: '/', params });
}

// 지도 탭으로 이동해 특정 장소를 선택·포커스한다.
// focusTs 는 같은 장소를 연속 선택해도 지도 화면이 반응하도록 매번 다른 키를
// 만드는 규약 — 호출처마다 흩어져 있던 것을 여기 한 곳으로 모은다.
export function focusPlaceOnMap(
  placeId: string,
  opts?: { reviewId?: string; fromCourseId?: string; source?: PlaceSource; place?: Place }
) {
  // 장소에 닿은 경로를 남긴다 — 어느 발견 경로가 주행까지 이어지는지 가르는 축
  track.placeViewed({ place_id: placeId, source: opts?.source ?? 'search' });
  if (focusOverride) {
    focusOverride(placeId, opts);
    return;
  }
  // 장소를 들고 있으면 usePlace 캐시를 채워 복귀 즉시 이동을 시작한다.
  if (opts?.place) {
    queryClient.setQueryData(['place', placeId], opts.place);
  }
  // 기존 지도 탭까지 스택을 되감아 같은 네이티브 지도 인스턴스와 카메라를
  // 그대로 살린다. navigate('/')는 새 탭 route를 쌓아 지도를 재생성할 수 있다.
  openMapRoute({
    focusPlaceId: placeId,
    focusTs: String(Date.now()),
    focusReviewId: opts?.reviewId,
    fromCourseId: opts?.fromCourseId,
    kakaoName: undefined,
    kakaoAddress: undefined,
    kakaoLat: undefined,
    kakaoLng: undefined,
    kakaoPhone: undefined,
    kakaoId: undefined,
    kakaoUrl: undefined,
    generalPlaceId: undefined,
  });
}

// 지도 탭으로 이동해 등록되지 않은 일반 장소를 연다 — 지도 딥링크의
// kakao* 경로(useMapDeepLinks)가 좌표 포커스와 일반 장소 카드를 띄운다.
// 라이딩 기록의 미등록 목적지처럼 이름·좌표만 남은 곳도 지도로 이어 준다.
export function focusPointOnMap(point: {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  providerId?: string;
  placeUrl?: string;
  generalPlaceId?: string;
}) {
  openMapRoute({
    focusPlaceId: undefined,
    focusReviewId: undefined,
    fromCourseId: undefined,
    kakaoName: point.name,
    kakaoAddress: point.address ?? '',
    kakaoLat: String(point.latitude),
    kakaoLng: String(point.longitude),
    kakaoPhone: point.phone ?? '',
    kakaoId: point.providerId ?? '',
    kakaoUrl: point.placeUrl ?? '',
    generalPlaceId: point.generalPlaceId ?? '',
    focusTs: String(Date.now()),
  });
}

// 지도 탭에서 내 위치 따라가기 모드를 켠다 — 안내가 끝나도 라이더는 계속
// 이동 중이므로 종료 직후 지도가 위치를 따라오게 한다(실주행 피드백).
export function followMyLocationOnMap() {
  router.navigate({
    pathname: '/',
    params: { followTs: String(Date.now()) },
  });
}
