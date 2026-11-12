import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDialogStore } from '@/lib/dialog';
import { useAuthStore } from '@/stores/useAuthStore';

// 내 장소(집·회사) — 반복 목적지 단축. 집 주소는 민감 정보라 기기 로컬에만 저장한다.
export type MyPlaceSlot = 'home' | 'work';

export interface MyPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const STORAGE_KEY = 'my-places';
type Places = Partial<Record<MyPlaceSlot, MyPlace>>;
type StoredPlaces = { owner: string; places: Places };

interface MyPlacesStore {
  places: Places;
  enabled: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  save: (slot: MyPlaceSlot, place: MyPlace) => Promise<void>;
  remove: (slot: MyPlaceSlot) => Promise<void>;
}

let revision = 0;
let needsReset = false;
let storageQueue: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>) {
  const next = storageQueue.then(work);
  storageQueue = next.catch(() => {});
  return next;
}

async function resetStorage() {
  if (!needsReset) return;
  await AsyncStorage.removeItem(STORAGE_KEY);
  needsReset = false;
}

export const useMyPlacesStore = create<MyPlacesStore>((set, get) => ({
  places: {},
  enabled: useAuthStore.getState().status === 'signed_in',
  loaded: false,
  load: async () => {
    const owner = useAuthStore.getState().session?.user.id;
    if (!owner || !get().enabled || get().loaded) return;
    const current = revision;
    await enqueue(async () => {
      if (current !== revision || !get().enabled || get().loaded) return;
      try {
        await resetStorage();
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (current !== revision) return;
        const stored = raw ? JSON.parse(raw) as StoredPlaces | Places : null;
        let places: Places = {};
        if (stored && 'owner' in stored) {
          if (stored.owner === owner) places = stored.places;
        } else if (stored) {
          // 계정 구분이 없던 기존 값은 현재 로그인한 계정에 연결한다.
          await persistPlaces(owner, stored);
          places = stored;
        }
        if (current === revision) set({ places, loaded: true });
      } catch {
        if (current === revision) set({ loaded: true });
      }
    });
  },
  save: async (slot, place) => {
    await writePlace(slot, place);
  },
  remove: async (slot) => {
    await writePlace(slot);
  },
}));

function persistPlaces(owner: string, places: Places) {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, places }));
}

async function writePlace(slot: MyPlaceSlot, place?: MyPlace) {
  const owner = useAuthStore.getState().session?.user.id;
  if (!owner || !useMyPlacesStore.getState().enabled) return;
  const current = revision;
  await useMyPlacesStore.getState().load();
  await enqueue(async () => {
    const state = useMyPlacesStore.getState();
    if (current !== revision || !state.enabled) return;
    await resetStorage();
    const places = { ...state.places };
    if (place) places[slot] = place;
    else delete places[slot];
    await persistPlaces(owner, places);
    if (current === revision) useMyPlacesStore.setState({ places });
  }).catch(() => {});
}

function clearPlaces() {
  revision++;
  needsReset = true;
  // 이전 저장이 진행 중이어도 디스크 삭제를 그 뒤에 실행한다.
  useMyPlacesStore.setState({ places: {}, loaded: false });
  void enqueue(resetStorage).catch(() => {});
}

useAuthStore.subscribe((state, previous) => {
  const actor = state.session?.user.id;
  const previousActor = previous.session?.user.id;
  const enabled = state.status === 'signed_in';
  const signedOut = state.status === 'signed_out' && previous.status !== 'signed_out';
  const switched = !!actor && !!previousActor && actor !== previousActor;
  if (!enabled || switched) {
    const dialog = useDialogStore.getState();
    if (dialog.dialog?.maskMessage) dialog.hide();
  }
  if (signedOut || switched) {
    useMyPlacesStore.setState({ enabled: false });
    clearPlaces();
  }
  if (useMyPlacesStore.getState().enabled === enabled) return;
  if (!enabled) {
    revision++;
    useMyPlacesStore.setState({ enabled: false, places: {}, loaded: false });
    return;
  }
  useMyPlacesStore.setState({ enabled: true });
  void useMyPlacesStore.getState().load();
});

if (useAuthStore.getState().status === 'signed_out') clearPlaces();
