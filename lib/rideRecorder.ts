import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { getCurrentUser } from '@/lib/auth';
import { insertRideSession, type RideSessionEndReason, type RideSessionInsert } from '@/lib/api/rideSessions';
import { fetchUserBikes } from '@/lib/api/userBikes';
import { haversine } from '@/lib/distance';
import {
  parseRidePathSegments,
  ridePathPointCount,
  rideSegmentsMovingDuration,
  simplifyRideSegments,
  type RidePathPoint,
  type RidePathSegments,
} from '@/lib/ridePath';
import { isRideRecordingEnabled } from '@/lib/rideRecordingPreference';

export interface RideRecordingGoal {
  latitude: number;
  longitude: number;
  name: string;
  placeId?: string;
  generalPlaceId?: string;
}

interface RecordingDraft {
  version: 1;
  state: 'recording';
  id: string;
  userId: string;
  bikeId: string | null;
  bikeModel: string | null;
  bikeNickname: string | null;
  goal: RideRecordingGoal;
  startedAtMs: number;
  updatedAtMs: number;
  isPartial: boolean;
  distanceM: number;
  segments: RidePathSegments;
}

interface FinalizedDraft {
  version: 1;
  state: 'ready';
  session: RideSessionInsert;
}

type StoredDraft = RecordingDraft | FinalizedDraft;

const RECORDING_DIRECTORY = `${FileSystem.documentDirectory}ride-sessions-v1/`;
const MIN_DISTANCE_METERS = 5;
const MAX_ACCURACY_METERS = 100;
const MAX_SPEED_METERS_PER_SECOND = 100;
const SEGMENT_GAP_MS = 30_000;
const PERSIST_POINT_INTERVAL = 10;
const PERSIST_TIME_INTERVAL_MS = 15_000;

let activeDraft: RecordingDraft | null = null;
let locationSubscription: Location.LocationSubscription | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirtyPointCount = 0;
let writeChain = Promise.resolve();

function draftPath(id: string): string {
  return `${RECORDING_DIRECTORY}${id}.json`;
}

async function ensureDirectory() {
  await FileSystem.makeDirectoryAsync(RECORDING_DIRECTORY, { intermediates: true });
}

function queueWrite(draft: StoredDraft): Promise<void> {
  const snapshot = JSON.stringify(draft);
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await ensureDirectory();
      await FileSystem.writeAsStringAsync(
        draftPath(draft.state === 'recording' ? draft.id : draft.session.id),
        snapshot,
      );
    });
  return writeChain;
}

function queueWriteInBackground(draft: StoredDraft) {
  void queueWrite(draft).catch(() => {
    // 기록 저장 실패는 길안내 흐름의 unhandled rejection이 되면 안 된다.
  });
}

function clearPersistTimer() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
}

function schedulePersist() {
  clearPersistTimer();
  persistTimer = setTimeout(() => {
    if (!activeDraft) return;
    activeDraft.updatedAtMs = Date.now();
    dirtyPointCount = 0;
    queueWriteInBackground(activeDraft);
    schedulePersist();
  }, PERSIST_TIME_INTERVAL_MS);
}

function currentSegment(draft: RecordingDraft): RidePathPoint[] {
  let segment = draft.segments[draft.segments.length - 1];
  if (!segment) {
    segment = [];
    draft.segments.push(segment);
  }
  return segment;
}

function closeShortSegment(draft: RecordingDraft) {
  const segment = draft.segments[draft.segments.length - 1];
  if (segment && segment.length < 2) draft.segments.pop();
}

function acceptLocation(location: Location.LocationObject) {
  const draft = activeDraft;
  if (!draft) return;
  const { latitude, longitude, accuracy } = location.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (accuracy !== null && accuracy > MAX_ACCURACY_METERS) return;

  const elapsedMs = Math.max(0, Math.round(location.timestamp - draft.startedAtMs));
  if (elapsedMs > 604_800_000) return;
  let segment = currentSegment(draft);
  const previous = segment[segment.length - 1];
  const next: RidePathPoint = [longitude, latitude, elapsedMs];

  if (previous) {
    const deltaMs = elapsedMs - previous[2];
    if (deltaMs < 0) return;
    if (deltaMs > SEGMENT_GAP_MS) {
      closeShortSegment(draft);
      segment = [];
      draft.segments.push(segment);
    } else {
      const distance = haversine(
        { longitude: previous[0], latitude: previous[1] },
        { longitude, latitude },
      );
      const speed = deltaMs > 0 ? distance / (deltaMs / 1000) : 0;
      if (speed > MAX_SPEED_METERS_PER_SECOND) return;
      if (distance < MIN_DISTANCE_METERS && deltaMs < 10_000) return;
      draft.distanceM += distance;
    }
  }

  segment.push(next);
  draft.updatedAtMs = Date.now();
  dirtyPointCount += 1;
  if (dirtyPointCount >= PERSIST_POINT_INTERVAL) {
    dirtyPointCount = 0;
    queueWriteInBackground(draft);
  }
}

async function stopLocationSubscription(markPartial: boolean) {
  locationSubscription?.remove();
  locationSubscription = null;
  if (!activeDraft) return;
  closeShortSegment(activeDraft);
  if (markPartial) activeDraft.isPartial = true;
  activeDraft.updatedAtMs = Date.now();
  await queueWrite(activeDraft);
}

async function startLocationSubscription() {
  if (!activeDraft || locationSubscription || AppState.currentState !== 'active') return;
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    activeDraft.isPartial = true;
    await queueWrite(activeDraft);
    return;
  }
  // 비활성화 뒤 복귀한 경우에는 앞선 좌표와 직선으로 잇지 않는다.
  if (activeDraft.segments.length > 0) activeDraft.segments.push([]);
  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 20,
      timeInterval: 5_000,
    },
    acceptLocation,
  );
}

function handleAppState(state: AppStateStatus) {
  if (!activeDraft) return;
  if (state === 'active') {
    void startLocationSubscription().catch(() => {
      if (activeDraft) activeDraft.isPartial = true;
    });
  } else {
    void stopLocationSubscription(true).catch(() => {
      if (activeDraft) activeDraft.isPartial = true;
    });
  }
}

function stopLifecycleListeners() {
  appStateSubscription?.remove();
  appStateSubscription = null;
  clearPersistTimer();
}

function finalizedSession(
  draft: RecordingDraft,
  reason: RideSessionEndReason,
  endedAtMs: number,
): RideSessionInsert | null {
  closeShortSegment(draft);
  const rawSegments = draft.segments.filter((segment) => segment.length >= 2);
  if (ridePathPointCount(rawSegments) < 2) return null;
  const pathSegments = simplifyRideSegments(rawSegments);
  const durationS = Math.max(0, Math.round((endedAtMs - draft.startedAtMs) / 1000));
  return {
    id: draft.id,
    userId: draft.userId,
    bikeId: draft.bikeId,
    bikeModel: draft.bikeModel,
    bikeNickname: draft.bikeNickname,
    goalPlaceId: draft.goal.placeId ?? null,
    goalGeneralPlaceId: draft.goal.generalPlaceId ?? null,
    goalName: draft.goal.name.trim().slice(0, 120) || '목적지',
    goalLatitude: draft.goal.latitude,
    goalLongitude: draft.goal.longitude,
    startedAt: new Date(draft.startedAtMs).toISOString(),
    endedAt: new Date(Math.max(draft.startedAtMs, endedAtMs)).toISOString(),
    endedReason: reason,
    isPartial: draft.isPartial || reason === 'interrupted',
    distanceM: Math.max(0, Math.round(draft.distanceM)),
    durationS,
    movingDurationS: Math.min(durationS, rideSegmentsMovingDuration(rawSegments)),
    pathSegments,
  };
}

async function readStoredDraft(uri: string): Promise<StoredDraft | null> {
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri)) as StoredDraft;
    if (!parsed || parsed.version !== 1) return null;
    if (parsed.state === 'ready') {
      const path = parseRidePathSegments(parsed.session?.pathSegments);
      if (!path) return null;
      return { ...parsed, session: { ...parsed.session, pathSegments: path } };
    }
    if (
      parsed.state !== 'recording'
      || typeof parsed.id !== 'string'
      || typeof parsed.userId !== 'string'
      || !Array.isArray(parsed.segments)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncStoredDraft(uri: string, draft: StoredDraft, userId: string) {
  let session: RideSessionInsert;
  if (draft.state === 'recording') {
    const recovered = finalizedSession(draft, 'interrupted', draft.updatedAtMs);
    if (!recovered) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return;
    }
    session = recovered;
    await queueWrite({ version: 1, state: 'ready', session });
  } else {
    session = draft.session;
  }
  if (session.userId !== userId) return;
  await insertRideSession(session);
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/** 로그인 복구·네트워크 재연결 뒤 남은 완성본과 강제 종료 초안을 동기화한다. */
export async function syncPendingRideSessions(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await ensureDirectory();
  const names = await FileSystem.readDirectoryAsync(RECORDING_DIRECTORY);
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    const uri = `${RECORDING_DIRECTORY}${name}`;
    const draft = await readStoredDraft(uri);
    if (!draft) continue;
    try {
      await syncStoredDraft(uri, draft, user.id);
    } catch {
      // 네트워크·미적용 마이그레이션이면 파일을 남겨 다음 기회에 재시도한다.
    }
  }
}

/** 로그아웃한 계정의 미동기화 위치가 다음 사용자에게 남지 않게 기기에서도 지운다. */
export async function clearPendingRideSessionsForUser(userId: string): Promise<void> {
  if (activeDraft?.userId === userId) {
    activeDraft = null;
    stopLifecycleListeners();
    locationSubscription?.remove();
    locationSubscription = null;
  }
  await writeChain.catch(() => {});
  await ensureDirectory();
  const names = await FileSystem.readDirectoryAsync(RECORDING_DIRECTORY);
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    const uri = `${RECORDING_DIRECTORY}${name}`;
    const draft = await readStoredDraft(uri);
    const draftUserId = draft?.state === 'recording'
      ? draft.userId
      : draft?.session.userId;
    if (draftUserId === userId) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  }
}

/** 실제 길안내 시작 시 호출한다. 미리보기·비로그인·동의 전이면 조용히 기록하지 않는다. */
export async function startRideRecording(
  goal: RideRecordingGoal,
  mode: 'live' | 'preview',
): Promise<boolean> {
  if (mode !== 'live') return false;
  const user = await getCurrentUser();
  if (!user || !(await isRideRecordingEnabled(user.id))) return false;
  if (activeDraft) await finishRideRecording('interrupted');

  const activeBike = await fetchUserBikes()
    .then((bikes) => bikes.find((bike) => bike.isActive) ?? null)
    .catch(() => null);
  const now = Date.now();
  activeDraft = {
    version: 1,
    state: 'recording',
    id: Crypto.randomUUID(),
    userId: user.id,
    bikeId: activeBike?.id ?? null,
    bikeModel: activeBike?.model ?? null,
    bikeNickname: activeBike?.nickname ?? null,
    goal,
    startedAtMs: now,
    updatedAtMs: now,
    isPartial: false,
    distanceM: 0,
    segments: [],
  };
  await queueWrite(activeDraft);
  appStateSubscription = AppState.addEventListener('change', handleAppState);
  schedulePersist();
  try {
    await startLocationSubscription();
  } catch {
    if (activeDraft) {
      activeDraft.isPartial = true;
      await queueWrite(activeDraft);
    }
  }
  return true;
}

/** 안내 종료는 업로드를 기다리지 않는다. 파일을 먼저 확정한 뒤 백그라운드로 동기화한다. */
export async function finishRideRecording(reason: RideSessionEndReason): Promise<string | null> {
  const draft = activeDraft;
  if (!draft) return null;
  activeDraft = null;
  stopLifecycleListeners();
  locationSubscription?.remove();
  locationSubscription = null;
  const session = finalizedSession(draft, reason, Date.now());
  if (!session) {
    await FileSystem.deleteAsync(draftPath(draft.id), { idempotent: true });
    return null;
  }
  const ready: FinalizedDraft = { version: 1, state: 'ready', session };
  await queueWrite(ready);
  void syncPendingRideSessions().catch(() => {});
  return session.id;
}

/** 안내 중 목적지가 바뀌면 최종 세션의 목적지도 같은 값으로 맞춘다. */
export function updateRideRecordingGoal(goal: RideRecordingGoal): void {
  if (!activeDraft) return;
  activeDraft.goal = goal;
  activeDraft.updatedAtMs = Date.now();
  queueWriteInBackground(activeDraft);
}

export function isRideRecordingActive(): boolean {
  return activeDraft !== null;
}
