import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'haptics-enabled-v1';

interface HapticsStore {
  enabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  load: () => Promise<void>;
}

export const useHapticsStore = create<HapticsStore>((set) => ({
  enabled: true,
  setEnabled: async (enabled) => {
    set({ enabled });
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0').catch(() => {});
  },
  load: async () => {
    const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (saved === '0' || saved === '1') set({ enabled: saved === '1' });
  },
}));
