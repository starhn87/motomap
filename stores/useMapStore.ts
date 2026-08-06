import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PlaceCategory } from '@/types';

// 즐겨찾기 지도 표시는 세션을 넘어 기억한다 (앱 재시작에도 유지)
const SHOW_FAVORITES_KEY = 'map-show-favorites';

interface Location {
  latitude: number;
  longitude: number;
}

interface MapStore {
  userLocation: Location | null;
  selectedPlaceId: string | null;
  activeFilter: PlaceCategory | null;
  /** 즐겨찾기 지도 표시 — 켜면 즐겨찾기 장소가 별 뱃지 마커로 항상 보인다 */
  showFavorites: boolean;
  setUserLocation: (location: Location) => void;
  setSelectedPlaceId: (id: string | null) => void;
  setActiveFilter: (filter: PlaceCategory | null) => void;
  toggleShowFavorites: () => void;
  /** 부팅 시 저장된 즐겨찾기 표시 상태 복원 (app/_layout.tsx) */
  loadShowFavorites: () => Promise<void>;
  /** 지도 탭을 초기 상태(시트·카드 닫힘)로 되돌리라는 신호 — 값이 바뀔 때마다 1회 */
  mapResetTs: number;
  requestMapReset: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  userLocation: null,
  selectedPlaceId: null,
  activeFilter: null,
  showFavorites: false,
  mapResetTs: 0,
  requestMapReset: () => set({ mapResetTs: Date.now() }),
  setUserLocation: (location) => set({ userLocation: location }),
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  toggleShowFavorites: () =>
    set((s) => {
      const next = !s.showFavorites;
      AsyncStorage.setItem(SHOW_FAVORITES_KEY, next ? '1' : '0').catch(() => {
        // 저장 실패해도 이번 세션 동작에는 지장 없다
      });
      return { showFavorites: next };
    }),
  loadShowFavorites: async () => {
    try {
      if ((await AsyncStorage.getItem(SHOW_FAVORITES_KEY)) === '1') {
        set({ showFavorites: true });
      }
    } catch {
      // 복원 실패는 기본값(꺼짐) 유지
    }
  },
}));
