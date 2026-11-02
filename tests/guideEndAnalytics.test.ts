import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const GUIDE_ACTIVE_KEY = 'guide-active';
const GUIDE_ARRIVED_KEY = 'guide-arrived-session';

type Ended = {
  guide_session_id: string;
  reason: string;
  exit: string;
  had_arrived: boolean;
  mode: string;
  remaining_m?: number;
  distance_m?: number;
};

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    data,
    async getItem(key: string) {
      return data[key] ?? null;
    },
    async setItem(key: string, value: string) {
      data[key] = value;
    },
    async removeItem(key: string) {
      delete data[key];
    },
  };
}

function setup(options?: {
  storage?: ReturnType<typeof memoryStorage>;
  meters?: number | null;
  confirmed?: boolean;
  goal?: { latitude: number; longitude: number; name: string; placeId?: string } | null;
}) {
  const storage = options?.storage ?? memoryStorage();
  const ended: Ended[] = [];
  const arrival = { confirmed: options?.confirmed === true };
  const goal = options?.goal === undefined
    ? { latitude: 37.5, longitude: 127, name: '목적지' }
    : options.goal;
  const store = {
    goal,
    viaPlaces: [] as unknown[],
    clear() {
      store.goal = null;
    },
  };
  const callbacks: Record<string, (payload?: any) => void> = {};
  const module = loadModule<{
    registerGuideEvents(): () => void;
    markGuideStarted(start: {
      guide_session_id: string;
      mode: 'live' | 'preview';
      priority: number;
      via_count: number;
      distance_m?: number;
    }): Promise<void>;
  }>('lib/guideEvents.ts', {
    '@/lib/guideMenuPolicy': {
      GUIDE_MENU_ACTIONS_ENABLED: false,
      GUIDE_ROUTE_EDITING_ENABLED: false,
      GUIDE_MENU_UNAVAILABLE_MESSAGE: '이번 버전에서는 안내 음량과 종료만 지원해요.',
    },
    '@/stores/useLocationPrivacyStore': {
      locationUseAllowed: () => true,
      providerLocationAllowed: () => false,
      withLocationUse: async (_purpose: unknown, _provider: unknown, work: () => Promise<unknown>) => work(),
      useLocationPrivacyStore: { getState: () => ({ revision: 1 }) },
    },
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'expo-router': { router: { push() {}, navigate() {} } },
    '@/lib/dialog': { appAlert() {} },
    'expo-location': {
      Accuracy: { Balanced: 3 },
      async getLastKnownPositionAsync() {
        if (options?.meters === null) return null;
        return { coords: { latitude: 37.5, longitude: 127 } };
      },
      async getCurrentPositionAsync() {
        if (options?.meters === null) throw new Error('no fix');
        return { coords: { latitude: 37.5, longitude: 127 } };
      },
    },
    '@/modules/kakao-navi': {
      __esModule: true,
      default: {
        addListener(event: string, fn: (payload?: any) => void) {
          callbacks[event] = fn;
          return { remove() {} };
        },
        showGuideToast: async () => {},
        showGuideNotice: async () => {},
        showGuideOptions: async () => -1,
        showGuidePoiOptions: async () => -1,
        showGuideHazardOptions: async () => -1,
        updateGuidePoiOptions: async () => {},
        openGuidePreview: async () => ({ token: 1, vias: [] }),
        returnToGuide: async () => true,
      },
      HAZARD_BUTTON_ID: 101,
      MOTOMAP_MENU_ID: 100,
      supportsKakaoNaviFeature: () => true,
      friendlyRouteError: (message: string) => message,
    },
    '@/lib/guidePreview': {},
    '@/lib/guideSession': { useGuideSession: { getState: () => store } },
    '@/constants/hazards': { HAZARD_LIST: [] },
    '@/lib/api/hazards': {},
    '@/lib/api/places': {},
    '@/lib/api/directions': {},
    '@/lib/distance': { haversine: () => options?.meters ?? 800 },
    '@/lib/mapFocus': { followMyLocationOnMap() {}, focusPlaceOnMap() {}, focusPointOnMap() {} },
    '@/lib/guideArrival': {
      hasGuideArrived: () => arrival.confirmed,
      matchesGuideArrival: () => true,
      recordGuideArrival: () => {
        arrival.confirmed = true;
        return Promise.resolve();
      },
    },
    '@/lib/toast': { toast: { error() {} } },
    '@/lib/analytics': {
      createAnalyticsId: (prefix: string) => `${prefix}_legacy`,
      track: {
        navigationEnded(event: Ended) {
          ended.push(event);
        },
        placeSubmissionPrompted() {},
        placeSubmissionOpened() {},
      },
    },
    '@/lib/api/kakaoLocal': {},
    '@/lib/api/gasStations': {},
  });
  return {
    ...module,
    storage,
    ended,
    callbacks,
    store,
    arrival,
    async flush() {
      for (let i = 0; i < 30; i++) await Promise.resolve();
    },
  };
}

const start = {
  guide_session_id: 'guide_live',
  mode: 'live' as const,
  priority: 0,
  via_count: 0,
  distance_m: 12000,
};

test('멀리서 직접 종료하면 중도 종료와 남은 거리를 남긴다', async () => {
  const guide = setup({ meters: 800 });
  guide.registerGuideEvents();
  await guide.flush();
  await guide.markGuideStarted(start);
  guide.callbacks.onGuideEnd();
  await guide.flush();

  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].reason, 'cancelled');
  assert.equal(guide.ended[0].exit, 'user_end');
  assert.equal(guide.ended[0].had_arrived, false);
  assert.equal(guide.ended[0].remaining_m, 800);
  assert.equal(guide.ended[0].distance_m, 12000);
  assert.equal(guide.ended[0].mode, 'live');
});

test('도착 콜백 없이 400m 안에서 종료하면 도착이지만 had_arrived 는 false 다', async () => {
  const guide = setup({ meters: 350 });
  guide.registerGuideEvents();
  await guide.flush();
  await guide.markGuideStarted(start);
  guide.callbacks.onGuideEnd();
  await guide.flush();

  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].reason, 'arrived');
  assert.equal(guide.ended[0].exit, 'user_end');
  assert.equal(guide.ended[0].had_arrived, false);
  assert.equal(guide.ended[0].remaining_m, 350);
});

test('도착 콜백 뒤 직접 종료는 had_arrived 를 남긴다', async () => {
  const guide = setup({ meters: 800 });
  guide.registerGuideEvents();
  await guide.flush();
  await guide.markGuideStarted(start);
  guide.callbacks.onGuideArrival({ name: '목적지', latitude: 37.5, longitude: 127, distance: 20 });
  await guide.flush();
  guide.callbacks.onGuideEnd();
  await guide.flush();

  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].reason, 'arrived');
  assert.equal(guide.ended[0].exit, 'user_end');
  assert.equal(guide.ended[0].had_arrived, true);
  assert.equal(guide.storage.data[GUIDE_ACTIVE_KEY], undefined);
  assert.equal(guide.storage.data[GUIDE_ARRIVED_KEY], undefined);
});

test('목적지가 없으면 종료 계기를 no_goal 로 남긴다', async () => {
  const guide = setup({ goal: null });
  guide.registerGuideEvents();
  await guide.flush();
  await guide.markGuideStarted(start);
  guide.callbacks.onGuideEnd();
  await guide.flush();

  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].reason, 'cancelled');
  assert.equal(guide.ended[0].exit, 'no_goal');
  assert.equal(guide.ended[0].remaining_m, undefined);
});

test('시작 마커가 남은 실패는 start_failed 이고 진행 중 거절은 종료로 세지 않는다', async () => {
  const guide = setup();
  guide.registerGuideEvents();
  await guide.flush();
  guide.callbacks.onGuideFailed({ code: 'ACTIVE_GUIDE', message: '기존 안내', preserveActive: true });
  await guide.flush();
  assert.equal(guide.ended.length, 0);

  await guide.markGuideStarted(start);
  guide.callbacks.onGuideFailed({ code: 'E_ROUTE', message: '경로 없음', preserveActive: false });
  await guide.flush();
  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].reason, 'cancelled');
  assert.equal(guide.ended[0].exit, 'start_failed');
  assert.equal(guide.ended[0].had_arrived, false);
});

test('다음 실행에 남은 마커는 프로세스 종료로 정산하고 도착 콜백만 구분한다', async () => {
  const storage = memoryStorage();
  const first = setup({ storage, meters: 40 });
  first.registerGuideEvents();
  await first.flush();
  await first.markGuideStarted(start);
  first.callbacks.onGuideArrival({ name: '목적지', latitude: 37.5, longitude: 127, distance: 40 });
  await first.flush();
  assert.equal(storage.data[GUIDE_ARRIVED_KEY], 'guide_live');

  const second = setup({ storage });
  second.registerGuideEvents();
  await second.flush();
  assert.equal(second.ended.length, 1);
  assert.equal(second.ended[0].reason, 'abandoned');
  assert.equal(second.ended[0].exit, 'process_end');
  assert.equal(second.ended[0].had_arrived, true);
  assert.equal(second.ended[0].guide_session_id, 'guide_live');
  assert.equal(storage.data[GUIDE_ACTIVE_KEY], undefined);
  assert.equal(storage.data[GUIDE_ARRIVED_KEY], undefined);
});

test('다른 세션의 도착 기록은 비정상 종료에 붙지 않는다', async () => {
  const storage = memoryStorage({
    [GUIDE_ACTIVE_KEY]: JSON.stringify({ ...start, guide_session_id: 'guide_next', started_at_ms: 10 }),
    [GUIDE_ARRIVED_KEY]: 'guide_live',
  });
  const guide = setup({ storage });
  guide.registerGuideEvents();
  await guide.flush();

  assert.equal(guide.ended.length, 1);
  assert.equal(guide.ended[0].exit, 'process_end');
  assert.equal(guide.ended[0].had_arrived, false);
  assert.equal(guide.ended[0].guide_session_id, 'guide_next');
});
