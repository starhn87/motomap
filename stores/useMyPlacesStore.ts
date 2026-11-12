import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAccountPlaces, importAccountPlaces, saveAccountPlace } from '@/lib/api/personalPlaces';
import { useDialogStore } from '@/lib/dialog';
import { useAuthStore } from '@/stores/useAuthStore';

export type MyPlaceSlot = 'home' | 'work';

export interface MyPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export type MyPlaces = Partial<Record<MyPlaceSlot, MyPlace>>;
type StoredPlaces = { owner: string; places: MyPlaces };
const STORAGE_KEY = 'my-places';

interface MyPlacesStore {
  places: MyPlaces;
  localPlaces: MyPlaces;
  enabled: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  save: (slot: MyPlaceSlot, place: MyPlace) => Promise<boolean>;
  remove: (slot: MyPlaceSlot) => Promise<boolean>;
}

let revision = 0;
let needsReset = false;
let queue = Promise.resolve();
let pendingRefresh: Promise<void> | undefined;
let activeRequest: AbortController | undefined;

function enqueue<T>(work: () => Promise<T>) {
  const next = queue.then(work);
  queue = next.then(() => {}, () => {});
  return next;
}

async function request<T>(work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) activeRequest = undefined;
  }
}

async function resetStorage() {
  if (!needsReset) return;
  await AsyncStorage.removeItem(STORAGE_KEY);
  needsReset = false;
}

const emptyPlaces = () => ({
  places: {}, localPlaces: {}, loaded: false,
});

export const useMyPlacesStore = create<MyPlacesStore>((set, get) => ({
  ...emptyPlaces(),
  enabled: useAuthStore.getState().status === 'signed_in',
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
        const stored = raw ? JSON.parse(raw) as StoredPlaces | MyPlaces : null;
        let places: MyPlaces = {};
        if (stored && 'owner' in stored) {
          if (stored.owner === owner) places = stored.places;
        } else if (stored) {
          // 계정 구분이 없던 기존 값은 현재 로그인한 계정의 기기에만 남긴다.
          await persistPlaces(owner, stored);
          places = stored;
        }
        if (current === revision) set({ places, localPlaces: places, loaded: true });
      } catch {
        if (current === revision) set({ loaded: true });
      }
      if (current === revision) void get().refreshAccount();
    });
  },
  refreshAccount: () => {
    const owner = useAuthStore.getState().session?.user.id;
    if (!owner || !get().enabled || !get().loaded) return Promise.resolve();
    if (pendingRefresh) return pendingRefresh;
    const current = revision;
    const next = enqueue(async () => {
      if (current !== revision) return;
      const local = get().localPlaces;
      const hasLocal = !!(local.home || local.work);
      const remote = await request(async signal => {
        if (hasLocal) await importAccountPlaces(owner, local, signal);
        return fetchAccountPlaces(owner, signal);
      });
      if (current !== revision) return;
      set({ places: remote });
      // 저장과 재조회가 성공한 경우에만 기존 기기 값의 유일한 복사본을 없앤다.
      if (hasLocal) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        if (current === revision) set({ localPlaces: {} });
      }
    }).catch(() => {});
    pendingRefresh = next;
    void next.then(() => { if (pendingRefresh === next) pendingRefresh = undefined; });
    return next;
  },
  save: writePlace,
  remove: (slot) => writePlace(slot),
}));

function persistPlaces(owner: string, places: MyPlaces) {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, places }));
}

async function writePlace(slot: MyPlaceSlot, place?: MyPlace) {
  const owner = useAuthStore.getState().session?.user.id;
  if (!owner || !useMyPlacesStore.getState().enabled) return false;
  const current = revision;
  await useMyPlacesStore.getState().load();
  return enqueue(async () => {
    const state = useMyPlacesStore.getState();
    if (current !== revision || !state.enabled) return false;
    await request(signal => saveAccountPlace(owner, slot, place, signal));
    if (current !== revision) return false;
    const places = { ...useMyPlacesStore.getState().places };
    if (place) places[slot] = place;
    else delete places[slot];
    useMyPlacesStore.setState({ places });
    void useMyPlacesStore.getState().refreshAccount();
    return true;
  }).catch(() => {
    if (current === revision) void useMyPlacesStore.getState().refreshAccount();
    return false;
  });
}

function clearMemory() {
  revision++;
  activeRequest?.abort();
  pendingRefresh = undefined;
  useMyPlacesStore.setState(emptyPlaces());
}

function clearPlaces() {
  needsReset = true;
  // 이전 저장이 진행 중이어도 디스크 삭제를 그 뒤에 실행한다.
  clearMemory();
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
  useMyPlacesStore.setState({ enabled });
  if (!enabled) {
    clearMemory();
    return;
  }
  void useMyPlacesStore.getState().load();
});

if (useAuthStore.getState().status === 'signed_out') clearPlaces();
