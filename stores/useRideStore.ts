import { create } from 'zustand';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { haversine } from '@/lib/distance';
import { toast } from '@/lib/toast';

interface Coord {
  latitude: number;
  longitude: number;
}

export interface RideSummary {
  coordinates: [number, number][]; // [lng, lat]
  distanceKm: number;
  durationSec: number;
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  startedAt: string; // ISO
  endedAt: string; // ISO
}

type RideStatus = 'idle' | 'tracking' | 'paused';

interface RideStore {
  status: RideStatus;
  coordinates: Coord[];
  distanceM: number;
  durationSec: number;
  currentSpeed: number; // km/h
  maxSpeed: number; // km/h
  start: () => Promise<boolean>;
  pause: () => void;
  resume: () => void;
  stop: () => RideSummary | null;
  reset: () => void;
}

export const RIDE_LOCATION_TASK = 'ride-location-tracking';

// 모듈 스코프 누적값/핸들 — 직렬화 대상이 아니고, 백그라운드 태스크 콜백에서도 접근한다.
// store state 에는 화면이 구독할 직렬화 가능한 값만 둔다.
let tickInterval: ReturnType<typeof setInterval> | null = null;
let prevCoord: Coord | null = null;
let prevFixMs = 0;
let segmentStartedMs = 0;
let accumulatedMs = 0;
let startedAtMs = 0;
let skipNextDistance = false;

const ACCURACY_MAX_M = 50; // 이보다 부정확한 fix 는 통째로 버림
const JUMP_MIN_M = 100; // 점프 판정 최소 거리
const JUMP_SPEED_MPS = 55.5; // ~200km/h 초과 이동 = GPS 스파이크
const STILL_MIN_M = 3; // 이보다 작은 이동은 정지로 간주(거리 누적 안 함)
const MAX_SPEED_CAP_KMH = 299; // 비현실적 최고속도 상한

// 위치 1건 처리 — 포어그라운드/백그라운드 태스크 콜백 양쪽에서 호출된다.
function processLocation(loc: Location.LocationObject) {
  if (useRideStore.getState().status !== 'tracking') return;

  const { latitude, longitude, accuracy, speed } = loc.coords;
  const now = loc.timestamp ?? Date.now();
  const cur: Coord = { latitude, longitude };

  // 1) 정확도 필터: 너무 부정확한 fix 는 통째로 버림
  if (accuracy != null && accuracy > ACCURACY_MAX_M) return;

  // 2) 첫 fix 또는 재개 직후 첫 fix: 기준점만 잡고 거리 누적은 스킵
  //    (재개 시 휴식 동안의 이동이 직선으로 합산되는 것을 방지)
  if (!prevCoord || skipNextDistance) {
    prevCoord = cur;
    prevFixMs = now;
    skipNextDistance = false;
    useRideStore.setState((st) => ({
      coordinates: [...st.coordinates, cur],
      currentSpeed: 0,
    }));
    return;
  }

  const d = haversine(prevCoord, cur); // meters
  const dt = prevFixMs > 0 ? (now - prevFixMs) / 1000 : 0; // seconds
  const instMps = dt > 0 ? d / dt : 0;

  // 3) 스파이크(비현실적 점프): 거리·좌표 무시, 기준점도 유지해 일시적 튐을 흡수
  if (d > JUMP_MIN_M && instMps > JUMP_SPEED_MPS) return;

  // 4) 미세 떨림/정지: 누적하지 않음 (정지 중 거리 부풀림 방지)
  if (d < STILL_MIN_M) {
    useRideStore.setState({ currentSpeed: 0 });
    return;
  }

  // 5) 정상 fix
  const mps = speed != null && speed >= 0 ? speed : instMps;
  let kmh = mps * 3.6;
  if (kmh > MAX_SPEED_CAP_KMH) kmh = instMps * 3.6; // speed 센서 이상치 폴백

  prevCoord = cur;
  prevFixMs = now;

  useRideStore.setState((st) => ({
    coordinates: [...st.coordinates, cur],
    distanceM: st.distanceM + d,
    currentSpeed: kmh,
    maxSpeed: kmh > st.maxSpeed && kmh < MAX_SPEED_CAP_KMH ? kmh : st.maxSpeed,
  }));
}

// 백그라운드 위치 태스크 — 모듈 평가 시점에 등록한다.
// 앱이 종료된 상태에서 OS 가 깨워도 호출되려면 진입점(app/_layout.tsx)에서
// 이 모듈이 import 되어야 한다.
TaskManager.defineTask(RIDE_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  if (!locations) return;
  for (const loc of locations) processLocation(loc);
});

function onTick() {
  if (useRideStore.getState().status !== 'tracking') return;
  const elapsed = accumulatedMs + (Date.now() - segmentStartedMs);
  useRideStore.setState({ durationSec: Math.floor(elapsed / 1000) });
}

function clearTimers() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

async function stopLocationTask() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(RIDE_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(RIDE_LOCATION_TASK);
  } catch {
    // 태스크가 시작 전이거나 이미 정리된 경우 무시
  }
}

export const useRideStore = create<RideStore>((set, get) => ({
  status: 'idle',
  coordinates: [],
  distanceM: 0,
  durationSec: 0,
  currentSpeed: 0,
  maxSpeed: 0,

  start: async () => {
    if (get().status !== 'idle') return false;

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      toast.error('위치 권한이 필요합니다.', '설정에서 위치 권한을 허용해주세요.');
      return false;
    }
    // 백그라운드 권한은 거부돼도 포어그라운드로는 동작하므로 진행하되 안내.
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      toast.info(
        '백그라운드 위치 권한이 없습니다.',
        '화면을 끄거나 다른 앱으로 전환하면 기록이 멈출 수 있어요. 설정에서 "항상 허용"을 권장합니다.'
      );
    }

    prevCoord = null;
    prevFixMs = 0;
    accumulatedMs = 0;
    segmentStartedMs = Date.now();
    startedAtMs = Date.now();
    skipNextDistance = false;
    set({
      status: 'tracking',
      coordinates: [],
      distanceM: 0,
      durationSec: 0,
      currentSpeed: 0,
      maxSpeed: 0,
    });

    await stopLocationTask(); // 잔여 태스크 정리
    try {
      await Location.startLocationUpdatesAsync(RIDE_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 1000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true, // iOS: 백그라운드 추적 표시줄
        activityType: Location.ActivityType.AutomotiveNavigation, // iOS
        foregroundService: {
          // Android: 백그라운드 추적 시 상시 알림 (필수)
          notificationTitle: 'RideMap 주행 기록 중',
          notificationBody: '주행 경로를 기록하고 있습니다.',
          notificationColor: '#22C55E',
        },
      });
    } catch (e: any) {
      toast.error('주행 기록을 시작할 수 없습니다.', e?.message);
      clearTimers();
      set({ status: 'idle' });
      return false;
    }

    tickInterval = setInterval(onTick, 1000);
    return true;
  },

  pause: () => {
    if (get().status !== 'tracking') return;
    accumulatedMs += Date.now() - segmentStartedMs;
    set({ status: 'paused', currentSpeed: 0 });
  },

  resume: () => {
    if (get().status !== 'paused') return;
    segmentStartedMs = Date.now();
    skipNextDistance = true; // 재개 첫 fix 거리 스킵
    set({ status: 'tracking' });
  },

  stop: () => {
    const s = get();
    if (s.status === 'idle') return null;
    if (s.status === 'tracking') {
      accumulatedMs += Date.now() - segmentStartedMs;
    }
    clearTimers();
    void stopLocationTask();

    const durationSec = Math.floor(accumulatedMs / 1000);
    const distanceKm = s.distanceM / 1000;
    const avgSpeed = durationSec > 0 ? distanceKm / (durationSec / 3600) : 0;
    const endedAtMs = Date.now();

    const summary: RideSummary = {
      coordinates: s.coordinates.map((c) => [c.longitude, c.latitude]),
      distanceKm,
      durationSec,
      avgSpeed,
      maxSpeed: s.maxSpeed,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    };

    set({ status: 'idle' });
    return summary;
  },

  reset: () => {
    clearTimers();
    void stopLocationTask();
    prevCoord = null;
    prevFixMs = 0;
    accumulatedMs = 0;
    segmentStartedMs = 0;
    startedAtMs = 0;
    skipNextDistance = false;
    set({
      status: 'idle',
      coordinates: [],
      distanceM: 0,
      durationSec: 0,
      currentSpeed: 0,
      maxSpeed: 0,
    });
  },
}));
