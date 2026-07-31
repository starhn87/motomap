import { create } from 'zustand';
import type { PlaceCategory } from '@/types';

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
}

export const useMapStore = create<MapStore>((set) => ({
  userLocation: null,
  selectedPlaceId: null,
  activeFilter: null,
  showFavorites: false,
  setUserLocation: (location) => set({ userLocation: location }),
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  toggleShowFavorites: () => set((s) => ({ showFavorites: !s.showFavorites })),
}));
