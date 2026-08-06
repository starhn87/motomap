import { router } from 'expo-router';

import { track, type PlaceSource } from '@/lib/analytics';

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

// 지도 탭으로 이동해 특정 장소를 선택·포커스한다.
// focusTs 는 같은 장소를 연속 선택해도 지도 화면이 반응하도록 매번 다른 키를
// 만드는 규약 — 호출처마다 흩어져 있던 것을 여기 한 곳으로 모은다.
export function focusPlaceOnMap(
  placeId: string,
  opts?: { reviewId?: string; fromCourseId?: string; source?: PlaceSource }
) {
  // 장소에 닿은 경로를 남긴다 — 어느 발견 경로가 주행까지 이어지는지 가르는 축
  track.placeViewed({ place_id: placeId, source: opts?.source ?? 'search' });
  if (focusOverride) {
    focusOverride(placeId, opts);
    return;
  }
  router.navigate({
    pathname: '/',
    params: {
      focusPlaceId: placeId,
      focusTs: String(Date.now()),
      ...(opts?.reviewId ? { focusReviewId: opts.reviewId } : {}),
      ...(opts?.fromCourseId ? { fromCourseId: opts.fromCourseId } : {}),
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
