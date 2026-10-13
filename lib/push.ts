import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { getCurrentUser } from '@/lib/auth';
import { isServiceResumeNotification, isServiceResumeResponse } from '@/lib/serviceResumeNotification';
import { getNavigationNotificationData } from '@/lib/notificationNavigation';
import { focusPlaceOnMap } from '@/lib/mapFocus';

const DEVICE_PUSH_TOKEN_KEY = 'device-push-token';

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

/**
 * Expo 푸시 토큰을 발급받아 push_tokens 테이블에 upsert한다.
 * - askPermission=true: 권한이 없으면 요청까지 (제보 직후 같은 맥락 있는 시점용)
 * - askPermission=false: 이미 허용된 경우에만 조용히 갱신 (앱 시작 시 토큰 로테이션 대응)
 * 푸시는 부가 기능이므로 실패(시뮬레이터·권한 거부·네트워크)는 조용히 무시한다.
 */
export async function registerPushToken(askPermission: boolean): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '기본 알림',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (!askPermission) return;
      ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== 'granted') return;
    }

    const user = await getCurrentUser();
    if (!user) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // token이 PK — 기기 주인이 계정을 바꾸면 해당 기기 토큰이 새 계정으로 넘어간다
    const { error } = await supabase.from('push_tokens').upsert({
      token,
      user_id: user.id,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await AsyncStorage.setItem(DEVICE_PUSH_TOKEN_KEY, token);
  } catch {
    // 부가 기능 — 조용히 무시
  }
}

/** 로그아웃 전에 현재 기기의 토큰만 해제한다. 다른 기기의 알림은 유지한다. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;

    let token = await AsyncStorage.getItem(DEVICE_PUSH_TOKEN_KEY);
    if (!token) {
      const { status } = await Notifications.getPermissionsAsync();
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (status === 'granted' && projectId) {
        ({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId }));
      }
    }
    if (!token) return;

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('token', token)
      .eq('user_id', user.id);
    if (error) throw error;
    await AsyncStorage.removeItem(DEVICE_PUSH_TOKEN_KEY);
  } catch {
    // 로그아웃 자체를 막지 않는다. 같은 기기에서 다음 계정이 등록되면 token PK가 이관된다.
  }
}
