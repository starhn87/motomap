import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { RESUME_NOTIFICATION_KEY, setupServiceResumeNotification } from '../../lib/serviceResumeNotification';

export function setupResumeStoreLink(): () => void {
  return setupServiceResumeNotification({
    defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    getLastResponse: Notifications.getLastNotificationResponseAsync,
    listen: Notifications.addNotificationResponseReceivedListener,
    getHandledId: () => AsyncStorage.getItem(RESUME_NOTIFICATION_KEY),
    setHandledId: (id) => AsyncStorage.setItem(RESUME_NOTIFICATION_KEY, id),
    openStore: () => Linking.openURL('https://apps.apple.com/kr/app/id6773636183'),
  });
}
