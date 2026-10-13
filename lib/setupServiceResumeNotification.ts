import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Linking } from 'react-native';
import { APP_STORE_URL } from '@/constants/app';
import { RESUME_NOTIFICATION_KEY, RESUME_PENDING_KEY, setupServiceResumeNotification } from './serviceResumeNotification';
import { createForegroundWaiter } from './foregroundLink';
import { getNavigationNotificationData } from './notificationNavigation';

// 권한 요청·토큰 발급·서버 접근 없이 알림 탭만 연결한다.
export function setupResumeStoreLink(onOpenFailure?: () => void) {
  const foreground = createForegroundWaiter(AppState);
  const controller = setupServiceResumeNotification({
    defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    getLastResponse: Notifications.getLastNotificationResponseAsync,
    listen: Notifications.addNotificationResponseReceivedListener,
    getHandledId: () => AsyncStorage.getItem(RESUME_NOTIFICATION_KEY),
    setHandledId: (id) => AsyncStorage.setItem(RESUME_NOTIFICATION_KEY, id),
    getPendingIntent: async () => {
      const value = await AsyncStorage.getItem(RESUME_PENDING_KEY);
      return value ? JSON.parse(value) : null;
    },
    setPendingIntent: (intent) => AsyncStorage.setItem(RESUME_PENDING_KEY, JSON.stringify(intent)),
    clearPendingIntent: () => AsyncStorage.removeItem(RESUME_PENDING_KEY),
    waitForActive: foreground.waitForActive,
    cancelActiveWait: foreground.cancelPending,
    openStore: () => Linking.openURL(APP_STORE_URL),
    onOpenFailure,
    hasNavigationTarget: (response) => getNavigationNotificationData(response) !== null,
  });
  return {
    ...controller,
    dispose() { controller.dispose(); foreground.dispose(); },
  };
}
