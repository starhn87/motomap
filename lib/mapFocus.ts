import { router } from 'expo-router';

// 지도 탭으로 이동해 특정 장소를 선택·포커스한다.
// focusTs 는 같은 장소를 연속 선택해도 지도 화면이 반응하도록 매번 다른 키를
// 만드는 규약 — 호출처마다 흩어져 있던 것을 여기 한 곳으로 모은다.
export function focusPlaceOnMap(
  placeId: string,
  opts?: { reviewId?: string; fromCourseId?: string }
) {
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
