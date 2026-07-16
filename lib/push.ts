import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

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
function routeFromNotification(data: Record<string, unknown> | undefined) {
  try {
    if (!data) return;
    if (data.type === 'place_approved' && typeof data.placeId === 'string') {
      // focusTs(nonce)가 없으면 같은 장소 재탭이 중복 판정에 걸려 시트가 안 열린다
      router.push({
        pathname: '/',
        params: { focusPlaceId: data.placeId, focusTs: String(Date.now()) },
      });
    } else if (data.type === 'course_approved' && typeof data.courseId === 'string') {
      router.push(`/course/${data.courseId}`);
    } else if (
      data.type === 'place_rejected' ||
      data.type === 'course_rejected' ||
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
    }
  } catch {
    // 내비게이션 준비 전 등 — 이동 실패는 치명적이지 않음
  }
}

/** 알림 탭 처리 등록 — cold start(알림으로 앱 실행)와 실행 중 탭 모두 커버 */
export function setupNotificationTapHandling(): () => void {
  void Notifications.getLastNotificationResponseAsync().then((resp) => {
    routeFromNotification(
      resp?.notification.request.content.data as Record<string, unknown> | undefined,
    );
  });
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    routeFromNotification(
      resp.notification.request.content.data as Record<string, unknown>,
    );
  });
  return () => sub.remove();
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
    await supabase.from('push_tokens').upsert({
      token,
      user_id: user.id,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // 부가 기능 — 조용히 무시
  }
}
