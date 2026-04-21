import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NavAppId = 'kakaonavi' | 'tmap' | 'kakaomap' | 'nmap' | 'apple';

const VALID_IDS: readonly NavAppId[] = [
  'kakaonavi',
  'tmap',
  'kakaomap',
  'nmap',
  'apple',
];
const STORAGE_KEY = 'nav-default-app';

interface NavPrefStore {
  defaultApp: NavAppId | null;
  setDefaultApp: (id: NavAppId | null) => Promise<void>;
  loadDefaultApp: () => Promise<void>;
}

export const useNavPrefStore = create<NavPrefStore>((set) => ({
  defaultApp: null,
  setDefaultApp: async (id) => {
    set({ defaultApp: id });
    if (id) {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  },
  loadDefaultApp: async () => {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && (VALID_IDS as readonly string[]).includes(saved)) {
      set({ defaultApp: saved as NavAppId });
    }
  },
}));
