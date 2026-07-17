import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 내 장소(집·회사) — 반복 목적지 단축. 집 주소는 민감 정보라 기기 로컬에만 저장한다.
export type MyPlaceSlot = 'home' | 'work';

export interface MyPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const STORAGE_KEY = 'my-places';

interface MyPlacesStore {
  places: Partial<Record<MyPlaceSlot, MyPlace>>;
  loaded: boolean;
  load: () => Promise<void>;
  save: (slot: MyPlaceSlot, place: MyPlace) => Promise<void>;
  remove: (slot: MyPlaceSlot) => Promise<void>;
}

export const useMyPlacesStore = create<MyPlacesStore>((set, get) => ({
  places: {},
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ places: raw ? JSON.parse(raw) : {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (slot, place) => {
    const places = { ...get().places, [slot]: place };
    set({ places });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  },
  remove: async (slot) => {
    const places = { ...get().places };
    delete places[slot];
    set({ places });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  },
}));
