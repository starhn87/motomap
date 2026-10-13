import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Linking } from 'react-native';
import { RESUME_NOTIFICATION_KEY, RESUME_PENDING_KEY, setupServiceResumeNotification } from '../../lib/serviceResumeNotification';
import { createForegroundWaiter } from '../../lib/foregroundLink';

export function setupResumeStoreLink() {
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
    openStore: () => Linking.openURL('https://apps.apple.com/kr/app/id6773636183'),
  });
  return {
    ...controller,
    dispose() { controller.dispose(); foreground.dispose(); },
  };
}
