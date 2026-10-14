import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { queryClient } from '@/lib/queryClient';
import { isServiceResumeNotification, isServiceResumeResponse } from '@/lib/serviceResumeNotification';
import { getNavigationNotificationData } from '@/lib/notificationNavigation';
import { focusPlaceOnMap } from '@/lib/mapFocus';

export { registerPushToken } from '@/lib/pushTokens';

// 포그라운드에서도 알림 배너 표시 (기본은 무음 폐기)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// 푸시의 data 페이로드(트리거가 심음)에 따라 해당 화면으로 이동
function routeFromNotification(data: Record<string, unknown>): boolean {
  try {
    // 재개 알림은 루트가 스토어로 연결한다. 알림 목록으로 중복 이동하지 않는다.
    if (isServiceResumeNotification(data)) return false;
    if (
      (data.type === 'place_approved' || data.type === 'place_change_resolved') &&
      typeof data.placeId === 'string'
    ) {
      // 알림 목록과 같은 경로로 지도 인스턴스를 유지하고 이전 일반 장소 params를 비운다.
      focusPlaceOnMap(data.placeId, { source: 'notification' });
    } else if (data.type === 'course_approved' && typeof data.courseId === 'string') {
      router.push(`/course/${data.courseId}`);
    } else if (
      data.type === 'riding_guide_published' &&
      typeof data.guideId === 'string'
    ) {
      router.push(`/riding/${data.guideId}`);
    } else if (data.type === 'review_liked' && typeof data.placeId === 'string') {
      focusPlaceOnMap(data.placeId, { source: 'notification' });
    } else if (data.type === 'notice') {
      // 공지는 운영자가 data.url을 넣었으면 해당 앱 화면으로, 없으면 본문을
      // 확인할 수 있는 알림 목록으로 보낸다.
      router.push(
        typeof data.url === 'string' && /^\/(?!\/)/.test(data.url)
          ? (data.url as never)
          : '/notifications',
      );
    } else if (
      data.type === 'place_rejected' ||
      data.type === 'place_change_resolved' ||
      data.type === 'place_change_dismissed' ||
      data.type === 'course_rejected' ||
      data.type === 'riding_guide_rejected' ||
      data.type === 'feedback_reply'
    ) {
      // 반려·건의 답변은 이동할 상세 화면이 없다 — 알림 목록에서 해당 알림을 스크롤·강조
      router.push({
        pathname: '/notifications',
        params:
          typeof data.notificationId === 'string'
            ? { highlightId: data.notificationId, highlightTs: String(Date.now()) }
            : {},
      });
    } else return false;
    return true;
  } catch {
    // 내비게이션 준비 전 등 — 이동 실패는 치명적이지 않음
    return false;
  }
}

/** 알림 탭 처리 등록 — cold start(알림으로 앱 실행)와 실행 중 탭 모두 커버 */
export function setupNotificationTapHandling(): () => void {
  let disposed = false;
  let responseSequence = 0;
  const handled = new Map<string, number>();
  function clearLastResponse(id: string) {
    const sequence = responseSequence;
    void Notifications.getLastNotificationResponseAsync().then((latest) => {
      if (!disposed && sequence === responseSequence && latest?.notification.request.identifier === id)
        return Notifications.clearLastNotificationResponseAsync();
    }).catch(() => {});
  }
  function handleResponse(resp: Notifications.NotificationResponse) {
    if (disposed || resp.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER || isServiceResumeResponse(resp)) return;
    const id = resp.notification.request.identifier;
    if (!id) return;
    const now = Date.now();
    // 연속 중복 이벤트만 합친다. 나중에 같은 알림을 다시 누르면 새 상세 요청이다.
    for (const [key, at] of handled) if (now - at >= 1000) handled.delete(key);
    if (handled.has(id)) {
      // 중복 이벤트가 왔다고 마지막 응답 정리까지 취소해 오래된 탭을 남기지 않는다.
      clearLastResponse(id);
      return;
    }
    const data = getNavigationNotificationData(resp);
    if (!data || !routeFromNotification(data)) return;
    handled.set(id, now);
    // 초기 조회와 listener의 중복을 막고, 성공한 옛 응답을 다음 실행에서 재생하지 않는다.
    clearLastResponse(id);
  }
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    responseSequence++;
    handleResponse(resp);
  });
  void Notifications.getLastNotificationResponseAsync().then((resp) => {
    // 늦은 콜드 조회가 최신 웜 탭을 덮어쓰지 않는다.
    if (resp && responseSequence === 0) handleResponse(resp);
  }).catch(() => {});
  // 앱을 켜둔 채 푸시를 받은 경우 — 목록·뱃지가 바로 따라오게 캐시를 턴다
  const received = Notifications.addNotificationReceivedListener(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });
  return () => {
    disposed = true;
    sub.remove();
    received.remove();
  };
}
