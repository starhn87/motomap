import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { APP_STORE_URL } from '@/constants/app';
import { RESUME_NOTIFICATION_KEY, setupServiceResumeNotification } from './serviceResumeNotification';

// 권한 요청·토큰 발급·서버 접근 없이 알림 탭만 연결한다.
export function setupResumeStoreLink(): () => void {
  return setupServiceResumeNotification({
    defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    getLastResponse: Notifications.getLastNotificationResponseAsync,
    listen: Notifications.addNotificationResponseReceivedListener,
    getHandledId: () => AsyncStorage.getItem(RESUME_NOTIFICATION_KEY),
    setHandledId: (id) => AsyncStorage.setItem(RESUME_NOTIFICATION_KEY, id),
    openStore: () => Linking.openURL(APP_STORE_URL),
  });
}
