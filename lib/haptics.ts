import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useHapticsStore } from '@/stores/useHapticsStore';

let lastFeedbackAt = 0;

function canPlay(minimumInterval: number): boolean {
  if (Platform.OS === 'web' || !useHapticsStore.getState().enabled) return false;
  const now = Date.now();
  if (now - lastFeedbackAt < minimumInterval) return false;
  lastFeedbackAt = now;
  return true;
}

export const haptics = {
  selection(minimumInterval = 0) {
    if (!canPlay(minimumInterval)) return;
    void Haptics.selectionAsync().catch(() => {});
  },

  impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
    if (!canPlay(0)) return;
    void Haptics.impactAsync(style).catch(() => {});
  },

  success() {
    if (!canPlay(0)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
