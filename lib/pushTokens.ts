import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';

const TOKEN_KEY = 'device-push-token';
const RETRY_DELAYS = [1500, 5000];
const REQUEST_TIMEOUT = 12000;
const REPORT_INTERVAL = 5 * 60 * 1000;

export type PushTokenResult = 'registered' | 'denied' | 'signed-out' | 'cancelled' | 'failed';
type Registration = {
  generation: number;
  actor?: string;
  nativeToken?: Notifications.DevicePushToken;
};

let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
let activeRegistration: AbortController | null = null;
let logout: Promise<void> | null = null;
let currentDeviceToken: string | null = null;
let syncOwner: object | null = null;
const pending = new Map<string, Promise<PushTokenResult>>();
const reportedAt = new Map<string, number>();

class Cancelled extends Error {}
class Blocked extends Error {}

function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}

function invalidateRegistration() {
  generation++;
  activeRegistration?.abort();
}

// 토큰·사용자·공급자 원문은 오류 메시지나 태그에 복제하지 않는다.
function report(stage: string, error: unknown) {
  const candidate = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
  const code = typeof candidate === 'string' && /^[A-Z0-9_]{1,32}$/.test(candidate) ? candidate : 'unknown';
  const key = `${stage}:${code}`;
  if (Date.now() - (reportedAt.get(key) ?? -Infinity) < REPORT_INTERVAL) return;
  reportedAt.set(key, Date.now());
  try {
    Sentry.withScope(scope => {
      scope.setTag('area', 'push_token');
      scope.setTag('push_token_stage', stage);
      scope.setTag('error_code', code);
      Sentry.captureMessage('Push token synchronization failed', 'warning');
    });
  } catch {
    // 오류 보고 실패가 로그인·제보를 막지 않는다.
  }
}

function allowed(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.status === 'granted'
    || (Platform.OS === 'ios' && (
      permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      || permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
    ));
}

function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Cancelled()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      reject(new Error('Push operation timed out'));
    }, REQUEST_TIMEOUT);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(value => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value);
    }, error => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error);
    });
  });
}

async function sessionActor(signal: AbortSignal) {
  const { data, error } = await bounded(supabase.auth.getSession(), signal);
  if (error) throw error;
  return data.session?.user.id ?? null;
}

function check(request: Registration, signal: AbortSignal) {
  if (signal.aborted || request.generation !== generation) throw new Cancelled();
}

async function checkActor(actor: string, request: Registration, signal: AbortSignal) {
  check(request, signal);
  if (await sessionActor(signal) !== actor) throw new Cancelled();
  check(request, signal);
}

async function deleteToken(token: string, actor: string, signal: AbortSignal) {
  const { error } = await databaseRequest(signal, requestSignal => supabase.from('push_tokens').delete()
    .eq('token', token).eq('user_id', actor).abortSignal(requestSignal));
  if (error) throw error;
}

async function databaseRequest<T>(signal: AbortSignal, work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    // 쿼리 자체가 끝나기 전에 직렬 큐를 풀지 않는다.
    return await work(controller.signal);
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
  }
}

function retryable(error: unknown) {
  if (error instanceof Blocked || error instanceof Cancelled) return false;
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
  // 소유권·스키마 오류는 네트워크 재시도로 숨기지 않는다.
  return !['42501', '23503', '23505', '42P01', '42703', 'PGRST204'].includes(String(code));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Cancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

async function register(request: Registration, askPermission: boolean): Promise<PushTokenResult> {
  const controller = new AbortController();
  activeRegistration = controller;
  const signal = controller.signal;
  let stage = 'session';
  let asked = false;
  let token: string | undefined;
  let actor: string | null = null;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        check(request, signal);
        stage = 'session';
        const currentActor = await sessionActor(signal);
        if (!currentActor) return 'signed-out';
        if ((actor && actor !== currentActor) || (request.actor && request.actor !== currentActor)) return 'cancelled';
        actor = currentActor;
        if (Platform.OS === 'web') return 'denied';
        if (Platform.OS === 'android') {
          stage = 'channel';
          await bounded(Notifications.setNotificationChannelAsync('default', {
            name: '기본 알림', importance: Notifications.AndroidImportance.DEFAULT,
          }), signal);
        }
        stage = 'permission';
        let permission = await bounded(Notifications.getPermissionsAsync(), signal);
        if (!allowed(permission) && askPermission && !asked && permission.canAskAgain !== false) {
          asked = true;
          // 사용자의 권한 선택 대기는 네트워크 타임아웃으로 끊지 않는다.
          permission = await Notifications.requestPermissionsAsync();
        }
        await checkActor(actor, request, signal);
        stage = 'cache-read';
        const previous = await bounded(AsyncStorage.getItem(TOKEN_KEY), signal);
        if (!allowed(permission)) {
          // 설정에서 거부로 변경했다면 현재 기기의 연결만 해제한다.
          for (const old of new Set([previous, currentDeviceToken])) {
            if (!old) continue;
            stage = 'permission-cleanup';
            await checkActor(actor, request, signal);
            await deleteToken(old, actor, signal);
            await checkActor(actor, request, signal);
          }
          await AsyncStorage.removeItem(TOKEN_KEY);
          return 'denied';
        }
        stage = 'configuration';
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId || typeof projectId !== 'string') throw new Blocked('Missing EAS project');
        if (!token) {
          stage = 'expo-token';
          // 리스너는 APNs/FCM 토큰을 준다. 네이티브 토큰 조회를 재귀 호출하지 않는다.
          ({ data: token } = await bounded(Notifications.getExpoPushTokenAsync({
            projectId, ...(request.nativeToken ? { devicePushToken: request.nativeToken } : {}),
          }), signal));
        }
        await checkActor(actor, request, signal);
        currentDeviceToken = token;
        stage = 'upsert';
        const registeredToken = token;
        const registeredActor = actor;
        const { error } = await databaseRequest(signal, requestSignal => supabase.from('push_tokens').upsert({
          token: registeredToken, user_id: registeredActor, platform: Platform.OS, updated_at: new Date().toISOString(),
        }).abortSignal(requestSignal));
        if (error) throw error;
        await checkActor(actor, request, signal);
        if (previous && previous !== token) {
          stage = 'rotation-cleanup';
          await deleteToken(previous, actor, signal);
          await checkActor(actor, request, signal);
        }
        stage = 'cache-write';
        // 저장소 쓰기는 취소할 수 없다. 완료 전에 큐를 풀면 로그아웃 뒤 옛 캐시가 살아난다.
        await AsyncStorage.setItem(TOKEN_KEY, token);
        check(request, signal);
        return 'registered';
      } catch (error) {
        if (error instanceof Cancelled || signal.aborted || request.generation !== generation) return 'cancelled';
        if (attempt < RETRY_DELAYS.length && retryable(error)) {
          await delay(RETRY_DELAYS[attempt], signal);
          continue;
        }
        report(stage, error);
        return 'failed';
      }
    }
  } catch (error) {
    if (!(error instanceof Cancelled)) report(stage, error);
    return error instanceof Cancelled ? 'cancelled' : 'failed';
  } finally {
    if (activeRegistration === controller) activeRegistration = null;
  }
}

/** 기존 호출부를 유지하고 동시에 들어온 같은 등록 요청은 하나로 합친다. */
export function registerPushToken(askPermission: boolean, options: { actor?: string; nativeToken?: Notifications.DevicePushToken } = {}) {
  if (logout) return Promise.resolve<PushTokenResult>('cancelled');
  const request = { generation, ...options };
  const key = `${generation}:${options.actor ?? ''}:${askPermission}:${options.nativeToken ? JSON.stringify(options.nativeToken) : ''}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const result = serial(() => register(request, askPermission));
  pending.set(key, result);
  void result.then(() => { if (pending.get(key) === result) pending.delete(key); });
  return result;
}

/** 인증·동의 복원 후 시작하며 권한 창은 자동으로 표시하지 않는다. */
export function startPushTokenSync(actor: string) {
  if (Platform.OS === 'web') return () => {};
  const owner = {};
  syncOwner = owner;
  invalidateRegistration();
  let disposed = false;
  let lastNativeToken = '';
  let waitingForLogout = false;
  let previousAppState = AppState.currentState;
  const sync = (nativeToken?: Notifications.DevicePushToken) => {
    if (disposed || syncOwner !== owner || AppState.currentState !== 'active') return;
    if (logout) {
      if (!waitingForLogout) {
        waitingForLogout = true;
        const resume = () => { waitingForLogout = false; sync(); };
        void logout.then(resume, resume);
      }
      return;
    }
    void registerPushToken(false, { actor, nativeToken });
  };
  const appState = AppState.addEventListener('change', state => {
    const returned = state === 'active' && previousAppState !== 'active';
    previousAppState = state;
    if (returned && syncOwner === owner) { invalidateRegistration(); sync(); }
  });
  const tokenChange = Notifications.addPushTokenListener(nativeToken => {
    const value = JSON.stringify(nativeToken);
    if (disposed || syncOwner !== owner || value === lastNativeToken) return;
    lastNativeToken = value;
    invalidateRegistration();
    sync(nativeToken);
  });
  sync();
  return () => {
    disposed = true;
    appState.remove(); tokenChange.remove();
    if (syncOwner === owner) { syncOwner = null; invalidateRegistration(); }
  };
}

async function unregister(actor: string, signal: AbortSignal) {
  let token = await bounded(AsyncStorage.getItem(TOKEN_KEY), signal);
  if (!token && !currentDeviceToken) {
    const permission = await bounded(Notifications.getPermissionsAsync(), signal);
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (allowed(permission) && projectId) {
      ({ data: token } = await bounded(Notifications.getExpoPushTokenAsync({ projectId }), signal));
    }
  }
  for (const old of new Set([token, currentDeviceToken])) {
    if (!old) continue;
    if (await sessionActor(signal) !== actor) throw new Cancelled();
    await deleteToken(old, actor, signal);
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** 토큰 해제와 로그아웃을 직렬화하고 실패 시 같은 계정의 등록을 복구한다. */
export function signOutWithPushTokenCleanup(signOut: () => Promise<void>, expectedActor?: string | null): Promise<void> {
  if (logout) return logout;
  invalidateRegistration();
  const result = serial(async () => {
    const controller = new AbortController();
    const actor = await sessionActor(controller.signal);
    if (actor && expectedActor !== undefined && actor !== expectedActor) {
      throw new Error('로그인 계정이 변경됐어요. 다시 시도해 주세요.');
    }
    try {
      if (actor) await unregister(actor, controller.signal);
    } catch (error) {
      report('logout-cleanup', error);
      if (actor) await register({ generation, actor }, false);
      throw new Error('알림 연결을 정리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    try {
      // 해제 중 로그인 계정이 바뀌었다면 새 계정까지 로그아웃하지 않는다.
      if (await sessionActor(controller.signal) !== actor) {
        throw new Error('로그인 계정이 변경됐어요. 다시 시도해 주세요.');
      }
      await signOut();
    } catch (error) {
      if (actor) await register({ generation, actor }, false);
      throw error;
    }
  });
  logout = result;
  void result.then(() => { if (logout === result) logout = null; }, () => { if (logout === result) logout = null; });
  return result;
}
