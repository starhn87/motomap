import { router } from 'expo-router';

import { track, type PlaceSource } from '@/lib/analytics';
import { getLastMapCamera, isMainMapFocused } from '@/lib/mapCamera';
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

function createFocusRequestParams() {
  const focusTs = String(Date.now());
  const origin = getLastMapCamera();
  return {
    focusTs,
    // 직전 지도 전체 카메라를 요청에 고정한다. 검색 화면 아래에서 네이티브
    // 지도가 다시 붙는 동안 다른 이벤트가 들어와도 출발점이 바뀌지 않는다.
    ...(origin
      ? {
          focusOriginTs: focusTs,
          focusOriginRestore: isMainMapFocused() ? '0' : '1',
          focusOriginLat: String(origin.latitude),
          focusOriginLng: String(origin.longitude),
          focusOriginZoom: String(origin.zoom),
          focusOriginTilt: String(origin.tilt),
          focusOriginBearing: String(origin.bearing),
        }
      : {
          // router.navigate 가 기존 params 와 병합하더라도 앞선 요청의 출발점을
          // 재사용하지 않도록 명시적으로 비운다.
          focusOriginTs: '',
          focusOriginRestore: '',
          focusOriginLat: '',
          focusOriginLng: '',
          focusOriginZoom: '',
          focusOriginTilt: '',
          focusOriginBearing: '',
        }),
  };
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
  // 장소를 들고 있으면 usePlace 캐시를 채운다. 지도 탭은 화면이 다시 붙은 뒤
  // 아래에서 고정한 출발 카메라를 복원하고 목적지까지 이동한다.
  if (opts?.place) {
    queryClient.setQueryData(['place', placeId], opts.place);
  }
  const focusParams = createFocusRequestParams();
  router.navigate({
    pathname: '/',
    params: {
      focusPlaceId: placeId,
      ...focusParams,
      ...(opts?.reviewId ? { focusReviewId: opts.reviewId } : {}),
      ...(opts?.fromCourseId ? { fromCourseId: opts.fromCourseId } : {}),
    },
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
  const focusParams = createFocusRequestParams();
  router.navigate({
    pathname: '/',
    params: {
      kakaoName: point.name,
      kakaoAddress: point.address ?? '',
      kakaoLat: String(point.latitude),
      kakaoLng: String(point.longitude),
      kakaoPhone: point.phone ?? '',
      kakaoId: point.providerId ?? '',
      kakaoUrl: point.placeUrl ?? '',
      generalPlaceId: point.generalPlaceId ?? '',
      ...focusParams,
    },
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
