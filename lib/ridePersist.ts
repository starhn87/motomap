import AsyncStorage from '@react-native-async-storage/async-storage';

// 진행 중 주행 스냅샷 — 앱이 강제 종료/크래시되어도 기록을 복구(저장)하기 위해
// AsyncStorage에 주기적으로 저장한다. 정상 종료(stop)/리셋 시 삭제한다.
const KEY = 'ride-in-progress';

export interface RideSnapshot {
  status: 'tracking' | 'paused';
  coordinates: { latitude: number; longitude: number }[];
  distanceM: number;
  durationSec: number;
  maxSpeed: number; // km/h
  startedAtMs: number;
  updatedAtMs: number; // 마지막 저장 시각(종료 시각 추정에 사용)
}

export async function saveRideSnapshot(snapshot: RideSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // 저장 실패는 치명적이지 않으므로 조용히 무시(다음 tick에 재시도)
  }
}

export async function loadRideSnapshot(): Promise<RideSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RideSnapshot) : null;
  } catch {
    return null;
  }
}

export async function clearRideSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
